import { Controller, INestApplication, Param, Post, Req } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Request } from 'express';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { Public } from '../src/auth/session/access.decorators';
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

describe('Blocks (e2e, L6 S2)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let csrf: string | undefined;
  let counter = 0;

  async function csrfToken(): Promise<string> {
    if (csrf === undefined) {
      const response = await agent.get('/api/v1/status').expect(200);
      const cookies = response.headers['set-cookie'] as unknown as string[];
      csrf = cookies
        .find((value) => value.startsWith('y_csrf='))!
        .split(';')[0]
        .split('=')[1];
    }

    return csrf;
  }

  function sql(statement: string): Promise<string> {
    return runAsSuperuser(container, statement).then((result) => result.stdout.trim());
  }

  /** Creates an account in the given status, with a handle of its own. */
  async function createUser(status: 'active' | 'suspended'): Promise<{ id: string; handle: string }> {
    counter += 1;
    const handle = `member_${counter}`;
    const [id] = (
      await sql(
        `INSERT INTO users (handle, display_name, email, password_hash, status, terms_accepted_at, terms_version)
         VALUES ('${handle}', 'Member ${counter}', 'member-${counter}@example.test', 'hash', '${status}', now(), '1.0')
         RETURNING id;`,
      )
    ).split('\n');
    return { id, handle };
  }

  /** Starts a session for the user, through the probe route. */
  async function loginAs(userId: string): Promise<void> {
    const token = await csrfToken();
    await agent.post(`/api/v1/session-probe/login/${userId}`).set('x-csrf-token', token).expect(201);
  }

  function block(handle: string) {
    return agent.put(`/api/v1/users/${handle}/block`).set('x-csrf-token', csrf!);
  }

  function unblock(handle: string) {
    return agent.delete(`/api/v1/users/${handle}/block`).set('x-csrf-token', csrf!);
  }

  function follow(handle: string) {
    return agent.put(`/api/v1/users/${handle}/follow`).set('x-csrf-token', csrf!);
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    // The configuration is read when AppModule is loaded, so the database URL is set before the import.
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
    await csrfToken();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('blocks an account, removes the follows both ways and corrects both counters (R14)', async () => {
    const alice = await createUser('active');
    const bob = await createUser('active');
    await loginAs(alice.id);
    await follow(bob.handle).expect(200);
    await loginAs(bob.id);
    await follow(alice.handle).expect(200);

    await loginAs(alice.id);
    await block(bob.handle).expect(204);

    expect(
      await sql(
        `SELECT count(*) FROM follows WHERE (follower_id = '${alice.id}' AND followee_id = '${bob.id}') OR (follower_id = '${bob.id}' AND followee_id = '${alice.id}');`,
      ),
    ).toBe('0');
    expect(await sql(`SELECT following_count || '/' || follower_count FROM users WHERE id = '${alice.id}';`)).toBe('0/0');
    expect(await sql(`SELECT following_count || '/' || follower_count FROM users WHERE id = '${bob.id}';`)).toBe('0/0');
  });

  it('hides the questions of a blocked account from the blocker (404 on the question)', async () => {
    const author = await createUser('active');
    await loginAs(author.id);
    const questionId = (
      await agent.post('/api/v1/questions').set('x-csrf-token', csrf!).send({ text: 'Une question bloquée' }).expect(201)
    ).body.id;
    const blocker = await createUser('active');
    await loginAs(blocker.id);
    await block(author.handle).expect(204);

    await agent.get(`/api/v1/questions/${questionId}`).expect(404);
  });

  it('blocking again changes nothing (204)', async () => {
    const alice = await createUser('active');
    const bob = await createUser('active');
    await loginAs(alice.id);

    await block(bob.handle).expect(204);
    await block(bob.handle).expect(204);

    expect(
      await sql(`SELECT count(*) FROM blocks WHERE blocker_id = '${alice.id}' AND blocked_id = '${bob.id}';`),
    ).toBe('1');
  });

  it('answers an unknown or inactive account as not found (404), and refuses one’s own account (422)', async () => {
    const alice = await createUser('active');
    const suspended = await createUser('suspended');
    await loginAs(alice.id);

    await block('nobody_at_all').expect(404);
    await block(suspended.handle).expect(404);
    await block(alice.handle).expect(422);
  });

  it('lists the blocked accounts, most recent first, with a cursor (limit 1)', async () => {
    const alice = await createUser('active');
    const first = await createUser('active');
    const second = await createUser('active');
    await loginAs(alice.id);
    await block(first.handle).expect(204);
    await block(second.handle).expect(204);

    const page1 = await agent.get('/api/v1/users/me/blocks?limit=1').expect(200);
    expect(page1.body.items.map((item: { handle: string }) => item.handle)).toEqual([second.handle]);
    expect(page1.body.nextCursor).not.toBeNull();

    const page2 = await agent.get(`/api/v1/users/me/blocks?limit=1&cursor=${page1.body.nextCursor}`).expect(200);
    expect(page2.body.items.map((item: { handle: string }) => item.handle)).toEqual([first.handle]);
    expect(page2.body.nextCursor).toBeNull();
  });

  it('lifts the block (204), so the account is visible again; lifting one that does not exist is also 204', async () => {
    const alice = await createUser('active');
    const bob = await createUser('active');
    await loginAs(alice.id);
    await block(bob.handle).expect(204);

    await unblock(bob.handle).expect(204);
    await unblock('nobody_at_all').expect(204);

    expect(
      await sql(`SELECT count(*) FROM blocks WHERE blocker_id = '${alice.id}' AND blocked_id = '${bob.id}';`),
    ).toBe('0');
  });

  it('refuses a block from a suspended account (403)', async () => {
    const bob = await createUser('active');
    const suspended = await createUser('suspended');
    await loginAs(suspended.id);

    await block(bob.handle).expect(403);
  });
});
