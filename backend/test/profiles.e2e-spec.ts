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

interface Account {
  readonly id: string;
  readonly handle: string;
}

interface Client {
  readonly userId: string;
  readonly agent: ReturnType<typeof request.agent>;
  readonly token: string;
}

const NOT_FOUND = 'Compte introuvable.';

describe('Profiles (e2e, L1)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let counter = 0;

  function sql(statement: string): Promise<string> {
    return runAsSuperuser(container, statement).then((result) => result.stdout.trim());
  }

  async function createAccount(status: 'active' | 'suspended' = 'active'): Promise<Account> {
    counter += 1;
    const [row] = (
      await sql(
        `INSERT INTO users (handle, display_name, email, password_hash, status, terms_accepted_at, terms_version, bio)
         VALUES ('profile_${counter}', 'Profil ${counter}', 'profile-${counter}@example.test', 'hash', '${status}', now(), '1.0', 'Bio ${counter}')
         RETURNING id || '|' || handle;`,
      )
    ).split('\n');
    const [id, handle] = row.split('|');
    return { id, handle };
  }

  async function createQuestion(authorId: string, body: string, extra = ''): Promise<string> {
    const [id] = (
      await sql(
        `INSERT INTO questions (author_id, body, created_at ${extra ? ', moderation_status' : ''})
         VALUES ('${authorId}', '${body}', now() ${extra ? `, '${extra}'` : ''}) RETURNING id;`,
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

  function follow(client: Client, handle: string) {
    return client.agent.put(`/api/v1/users/${handle}/follow`).set('x-csrf-token', client.token);
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

  it('returns the public profile of an active account, with the follow state of the viewer (200)', async () => {
    const viewer = await createAccount();
    const target = await createAccount();
    const client = await clientFor(viewer.id);

    const before = await client.agent.get(`/api/v1/users/${target.handle}`).expect(200);
    expect(before.body).toMatchObject({
      handle: target.handle,
      displayName: `Profil ${target.handle.split('_')[1]}`,
      bio: `Bio ${target.handle.split('_')[1]}`,
      followerCount: 0,
      followingCount: 0,
      viewerFollows: false,
      isOwnAccount: false,
    });
    expect(typeof before.body.joinedAt).toBe('string');

    await follow(client, target.handle).expect(200);
    const after = await client.agent.get(`/api/v1/users/${target.handle}`).expect(200);
    expect(after.body).toMatchObject({ viewerFollows: true, followerCount: 1 });
  });

  it('finds the account whatever the case of the handle, and answers the stored handle', async () => {
    const viewer = await createAccount();
    const target = await createAccount();
    const client = await clientFor(viewer.id);

    const response = await client.agent.get(`/api/v1/users/${target.handle.toUpperCase()}`).expect(200);

    expect(response.body.handle).toBe(target.handle);
  });

  it('marks the viewer’s own account without a follow state', async () => {
    const viewer = await createAccount();
    const client = await clientFor(viewer.id);

    const response = await client.agent.get(`/api/v1/users/${viewer.handle}`).expect(200);

    expect(response.body).toMatchObject({ isOwnAccount: true, viewerFollows: false });
  });

  it('answers 404 with the same message for a suspended account, a blocked one, and an unknown handle', async () => {
    const viewer = await createAccount();
    const suspended = await createAccount('suspended');
    const blocked = await createAccount();
    await sql(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${blocked.id}', '${viewer.id}');`);
    const client = await clientFor(viewer.id);

    for (const handle of [suspended.handle, blocked.handle, 'nobody_at_all']) {
      const response = await client.agent.get(`/api/v1/users/${handle}`).expect(404);
      expect(response.body.detail).toBe(NOT_FOUND);
    }
  });

  it('refuses a malformed handle (400)', async () => {
    const viewer = await createAccount();
    const client = await clientFor(viewer.id);

    await client.agent.get('/api/v1/users/bad-handle!').expect(400);
  });

  it('lists the questions of the account newest first, in pages, and leaves out the hidden ones', async () => {
    const viewer = await createAccount();
    const author = await createAccount();
    const client = await clientFor(viewer.id);
    await createQuestion(author.id, 'Première', '');
    await createQuestion(author.id, 'Cachée', 'hidden');
    await createQuestion(author.id, 'Dernière', '');

    // One question per page: the walk ends when the API gives no next cursor.
    const texts: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
      const page: request.Response = await client.agent
        .get(`/api/v1/users/${author.handle}/questions?limit=1${query}`)
        .expect(200);
      texts.push(...page.body.questions.map((question: { text: string }) => question.text));
      cursor = page.body.nextCursor as string | null;
    } while (cursor !== null);

    expect(texts).toEqual(['Dernière', 'Première']);
  });

  it('answers 404 for the questions of an account that is not visible', async () => {
    const viewer = await createAccount();
    const suspended = await createAccount('suspended');
    const client = await clientFor(viewer.id);

    const response = await client.agent.get(`/api/v1/users/${suspended.handle}/questions`).expect(404);

    expect(response.body.detail).toBe(NOT_FOUND);
  });
});
