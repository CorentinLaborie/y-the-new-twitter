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

interface Client {
  readonly userId: string;
  readonly agent: ReturnType<typeof request.agent>;
  readonly token: string;
}

describe('One question, share view (e2e, M3 F11)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let counter = 0;

  function sql(statement: string): Promise<string> {
    return runAsSuperuser(container, statement).then((result) => result.stdout.trim());
  }

  async function createUser(status: 'active' | 'suspended' = 'active'): Promise<string> {
    counter += 1;
    const [id] = (
      await sql(
        `INSERT INTO users (handle, display_name, email, password_hash, status, terms_accepted_at, terms_version)
         VALUES ('viewer_${counter}', 'Viewer ${counter}', 'viewer-${counter}@example.test', 'hash', '${status}', now(), '1.0')
         RETURNING id;`,
      )
    ).split('\n');
    return id;
  }

  async function createQuestion(authorId: string, extra = ''): Promise<string> {
    const [id] = (
      await sql(
        `INSERT INTO questions (author_id, body ${extra ? ', moderation_status, deleted_at' : ''})
         VALUES ('${authorId}', 'Une question partagée' ${extra})
         RETURNING id;`,
      )
    ).split('\n');
    return id;
  }

  /** A separate cookie jar per user: each one has its own session and its own CSRF cookie. */
  async function clientFor(userId: string): Promise<Client> {
    const agent = request.agent(app.getHttpServer());
    const response = await agent.get('/api/v1/status').expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const token = cookies
      .find((value) => value.startsWith('y_csrf='))!
      .split(';')[0]
      .split('=')[1];
    await agent.post(`/api/v1/session-probe/login/${userId}`).set('x-csrf-token', token).expect(201);
    return { userId, agent, token };
  }

  function react(client: Client, questionId: string, kind: string) {
    return client.agent
      .put(`/api/v1/questions/${questionId}/reactions/${kind}`)
      .set('x-csrf-token', client.token);
  }

  function detail(client: Client, questionId: string) {
    return client.agent.get(`/api/v1/questions/${questionId}`);
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
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('returns a visible question with its counters and the viewer reaction, as the feed does', async () => {
    const author = await createUser();
    const question = await createQuestion(author);
    const other = await clientFor(await createUser());
    const viewer = await clientFor(await createUser());
    await react(other, question, 'y').expect(200);
    await react(viewer, question, 'like').expect(200);
    await sql(`UPDATE questions SET reply_count = 2 WHERE id = '${question}';`);

    const response = await detail(viewer, question).expect(200);

    expect(response.body).toMatchObject({
      id: question,
      text: 'Une question partagée',
      hashtags: [],
      counters: { like: 1, dislike: 0, y: 1, reply: 2 },
      yThreshold: 50,
      conversationOpen: false,
      viewerReactions: ['like'],
    });
  });

  it('returns 404 for a hidden question, and does not reveal it to a signed-in viewer', async () => {
    const author = await createUser();
    const hidden = await createQuestion(author, `, 'hidden', NULL`);
    const viewer = await clientFor(await createUser());

    await detail(viewer, hidden).expect(404);
  });

  it('returns 404 for a question whose author has blocked the viewer (R14)', async () => {
    const author = await createUser();
    const question = await createQuestion(author);
    const viewer = await clientFor(await createUser());
    await sql(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${author}', '${viewer.userId}');`);

    await detail(viewer, question).expect(404);
  });

  it('returns 404 for a deleted question', async () => {
    const author = await createUser();
    const deleted = await createQuestion(author, `, 'visible', now()`);
    const viewer = await clientFor(await createUser());

    await detail(viewer, deleted).expect(404);
  });

  it('refuses an id that is not a UUID (400) and a request without a session (401)', async () => {
    const author = await createUser();
    const question = await createQuestion(author);
    const viewer = await clientFor(await createUser());

    await detail(viewer, 'pas-un-uuid').expect(400);
    await request(app.getHttpServer()).get(`/api/v1/questions/${question}`).expect(401);
  });
});
