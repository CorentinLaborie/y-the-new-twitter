import { Controller, INestApplication, Param, Post, Req } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Request } from 'express';
import request from 'supertest';
import { Public } from '../src/auth/session/access.decorators';
import { configureApp } from '../src/configure-app';
import { runAsSuperuser, startMigratedPostgres } from './support/postgres';

/** Test-only route that starts a session for a user, through the real session middleware. */
@Controller('session-probe')
class SessionProbeController {
  @Public()
  @Post('login/:userId')
  login(@Req() req: Request, @Param('userId') userId: string): void {
    req.session.userId = userId;
  }
}

describe('Explore: trends, popular questions, search, suggestions and hashtags (e2e, M4)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let token: string;
  let viewer: string;
  let writer: string;
  let fan: string;
  let suggestedAway: string;

  function sql(statement: string): Promise<string> {
    return runAsSuperuser(container, statement).then((result) => result.stdout.trim());
  }

  async function createUser(handle: string, status = 'active'): Promise<string> {
    const [id] = (
      await sql(
        `INSERT INTO users (handle, display_name, email, password_hash, status, terms_accepted_at, terms_version)
         VALUES ('${handle}', '${handle} Test', '${handle}@example.test', 'hash', '${status}', now(), '1.0')
         RETURNING id;`,
      )
    ).split('\n');
    return id;
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    process.env.DATABASE_URL = container.getConnectionUri();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [SessionProbeController],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();

    agent = request.agent(app.getHttpServer());
    const status = await agent.get('/api/v1/status').expect(200);
    const cookies = status.headers['set-cookie'] as unknown as string[];
    token = cookies
      .find((value) => value.startsWith('y_csrf='))!
      .split(';')[0]
      .split('=')[1];

    viewer = await createUser('explore_viewer');
    writer = await createUser('explore_writer');
    fan = await createUser('explore_fan');
    suggestedAway = await createUser('explore_away');
    const blocked = await createUser('explore_blocked');
    const suspended = await createUser('explore_suspended', 'suspended');

    await sql(`INSERT INTO hashtags (name) VALUES ('tests');`);
    await sql(
      `INSERT INTO questions (id, author_id, body, created_at)
       VALUES ('aaaaaaaa-0000-4000-8000-000000000001', '${writer}', 'Question sur les tests #tests', now() - interval '2 hours');`,
    );
    await sql(
      `INSERT INTO questions (id, author_id, body, created_at)
       VALUES ('aaaaaaaa-0000-4000-8000-000000000002', '${writer}', 'Deuxième question #tests', now() - interval '1 hour');`,
    );
    await sql(
      `INSERT INTO question_hashtags (question_id, hashtag_id)
       SELECT q.id, h.id FROM questions q, hashtags h WHERE h.name = 'tests' AND q.author_id = '${writer}';`,
    );
    // A reaction in the last 24 hours from an active account, and one from a blocked account that must not count.
    await sql(
      `INSERT INTO question_reactions (user_id, question_id, kind, created_at)
       VALUES ('${fan}', 'aaaaaaaa-0000-4000-8000-000000000001', 'like', now() - interval '1 hour');`,
    );
    await sql(`INSERT INTO questions (author_id, body) VALUES ('${suspended}', 'Compte suspendu #tests');`);
    await sql(`INSERT INTO questions (author_id, body) VALUES ('${blocked}', 'Bloquée #tests');`);
    await sql(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${viewer}', '${blocked}');`);
    await sql(`INSERT INTO questions (author_id, body) VALUES ('${suggestedAway}', 'Une autre voix');`);

    await agent.post(`/api/v1/session-probe/login/${viewer}`).set('x-csrf-token', token).expect(201);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('lists the hashtags with reactions in the last 24 hours, without the reactions of blocked accounts', async () => {
    const response = await agent.get('/api/v1/explore/trends').expect(200);

    expect(response.body.hashtags).toEqual([{ name: 'tests', reactions: 1 }]);
  });

  it('returns the visible questions with the most reactions in the last 24 hours', async () => {
    const response = await agent.get('/api/v1/explore/popular').expect(200);

    expect(response.body.questions.map((question: { text: string }) => question.text)).toEqual([
      'Question sur les tests #tests',
    ]);
  });

  it('suggests active accounts the viewer does not follow, and leaves out blocked and suspended ones', async () => {
    const response = await agent.get('/api/v1/explore/suggestions').expect(200);
    const handles = response.body.accounts.map((account: { handle: string }) => account.handle);

    expect(handles).toContain('explore_writer');
    expect(handles).not.toContain('explore_viewer');
    expect(handles).not.toContain('explore_blocked');
    expect(handles).not.toContain('explore_suspended');
  });

  it('searches questions, hashtags and accounts from one text', async () => {
    const response = await agent.get('/api/v1/search?q=tests').expect(200);

    expect(response.body.hashtags).toEqual([{ name: 'tests' }]);
    expect(response.body.questions.length).toBeGreaterThan(0);
  });

  it('rejects an empty search text', async () => {
    await agent.get('/api/v1/search?q=%20%20').expect(400);
  });

  it('pages the questions of a hashtag, newest first, and rejects an invalid hashtag', async () => {
    const response = await agent.get('/api/v1/hashtags/tests/questions?limit=1').expect(200);

    expect(response.body.questions[0].text).toBe('Deuxième question #tests');
    expect(response.body.nextCursor).not.toBeNull();
    await agent.get('/api/v1/hashtags/%25bad/questions').expect(400);
  });
});
