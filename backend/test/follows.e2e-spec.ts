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
  readonly displayName: string;
}

interface Client {
  readonly userId: string;
  readonly agent: ReturnType<typeof request.agent>;
  readonly token: string;
}

describe('Follows (e2e, L3 E1, E2, E5)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let counter = 0;

  function sql(statement: string): Promise<string> {
    return runAsSuperuser(container, statement).then((result) => result.stdout.trim());
  }

  async function createAccount(status: 'active' | 'suspended' = 'active'): Promise<Account> {
    counter += 1;
    const displayName = `Follow ${counter}`;
    const [row] = (
      await sql(
        `INSERT INTO users (handle, display_name, email, password_hash, status, terms_accepted_at, terms_version)
         VALUES ('follow_${counter}', '${displayName}', 'follow-${counter}@example.test', 'hash', '${status}', now(), '1.0')
         RETURNING id || '|' || handle;`,
      )
    ).split('\n');
    const [id, handle] = row.split('|');
    return { id, handle, displayName };
  }

  /** A follow row. Its date is the one given (the lists are ordered by it), or the current time. */
  /** Inserts a follow row with the counters a real follow leaves behind (the counters never go below zero). */
  function insertFollow(followerId: string, followeeId: string, createdAt?: string): Promise<string> {
    const at = createdAt === undefined ? 'now()' : `'${createdAt}'`;
    return sql(
      `INSERT INTO follows (follower_id, followee_id, created_at) VALUES ('${followerId}', '${followeeId}', ${at});
       UPDATE users SET following_count = following_count + 1 WHERE id = '${followerId}';
       UPDATE users SET follower_count = follower_count + 1 WHERE id = '${followeeId}';`,
    );
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

  function unfollow(client: Client, handle: string) {
    return client.agent.delete(`/api/v1/users/${handle}/follow`).set('x-csrf-token', client.token);
  }

  function followRows(followerId: string, followeeId: string): Promise<string> {
    return sql(
      `SELECT count(*) FROM follows WHERE follower_id = '${followerId}' AND followee_id = '${followeeId}';`,
    );
  }

  /** The following count of the first account and the follower count of the second, as "following|followers". */
  function followCounters(followerId: string, followeeId: string): Promise<string> {
    return sql(
      `SELECT (SELECT following_count FROM users WHERE id = '${followerId}') || '|' || (SELECT follower_count FROM users WHERE id = '${followeeId}');`,
    );
  }

  function followNotices(recipientId: string): Promise<string> {
    return sql(
      `SELECT count(*) || ',' || coalesce(max(actor_id::text), 'null') || ',' || coalesce(max(question_id::text), 'null')
       FROM notifications WHERE type = 'follow' AND recipient_id = '${recipientId}';`,
    );
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

  it('follows an account (E1, 200 with the state), and writes one follow notice to it with the viewer as actor', async () => {
    const viewer = await createAccount();
    const target = await createAccount();
    const client = await clientFor(viewer.id);

    const response = await follow(client, target.handle).expect(200);

    expect(response.body).toEqual({ handle: target.handle, viewerFollows: true });
    expect(await followRows(viewer.id, target.id)).toBe('1');
    expect(await followCounters(viewer.id, target.id)).toBe('1|1');
    expect(await followNotices(target.id)).toBe(`1,${viewer.id},null`);
  });

  it('is idempotent: following again changes nothing and writes no second notice', async () => {
    const viewer = await createAccount();
    const target = await createAccount();
    const client = await clientFor(viewer.id);

    await follow(client, target.handle).expect(200);
    const again = await follow(client, target.handle).expect(200);

    expect(again.body).toEqual({ handle: target.handle, viewerFollows: true });
    expect(await followRows(viewer.id, target.id)).toBe('1');
    expect(await followNotices(target.id)).toBe(`1,${viewer.id},null`);
  });

  it('resolves the handle without regard to case, and answers the stored handle', async () => {
    const viewer = await createAccount();
    const target = await createAccount();
    const client = await clientFor(viewer.id);

    const response = await follow(client, target.handle.toUpperCase()).expect(200);

    expect(response.body).toEqual({ handle: target.handle, viewerFollows: true });
  });

  it('keeps one row and one notice under parallel follows of the same pair', async () => {
    const viewer = await createAccount();
    const target = await createAccount();
    const client = await clientFor(viewer.id);

    await Promise.all(Array.from({ length: 5 }, () => follow(client, target.handle).expect(200)));

    expect(await followRows(viewer.id, target.id)).toBe('1');
    expect(await followNotices(target.id)).toBe(`1,${viewer.id},null`);
  });

  it('unfollows (E2, 204), and repeating the unfollow changes nothing', async () => {
    const viewer = await createAccount();
    const target = await createAccount();
    const client = await clientFor(viewer.id);
    await follow(client, target.handle).expect(200);

    await unfollow(client, target.handle).expect(204);
    await unfollow(client, target.handle).expect(204);

    expect(await followRows(viewer.id, target.id)).toBe('0');
    expect(await followCounters(viewer.id, target.id)).toBe('0|0');
  });

  it('refuses to follow oneself (422) and stores nothing', async () => {
    const viewer = await createAccount();
    const client = await clientFor(viewer.id);

    await follow(client, viewer.handle).expect(422);

    expect(await followRows(viewer.id, viewer.id)).toBe('0');
  });

  it('answers 404 with the same message for an unknown handle, on PUT and on DELETE', async () => {
    const viewer = await createAccount();
    const client = await clientFor(viewer.id);

    const put = await follow(client, 'nobody_here').expect(404);
    const deleted = await unfollow(client, 'nobody_here').expect(404);

    expect(put.body.detail).toBe('Compte introuvable.');
    expect(deleted.body.detail).toBe('Compte introuvable.');
  });

  it('answers 404 on PUT for a suspended target, and stores nothing', async () => {
    const viewer = await createAccount();
    const suspended = await createAccount('suspended');
    const client = await clientFor(viewer.id);

    await follow(client, suspended.handle).expect(404);

    expect(await followRows(viewer.id, suspended.id)).toBe('0');
  });

  it('answers 404 on PUT for a target blocked in either direction, and stores nothing (R14)', async () => {
    const viewer = await createAccount();
    const blockedByViewer = await createAccount();
    const blockingViewer = await createAccount();
    await sql(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${viewer.id}', '${blockedByViewer.id}');`,
    );
    await sql(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${blockingViewer.id}', '${viewer.id}');`);
    const client = await clientFor(viewer.id);

    await follow(client, blockedByViewer.handle).expect(404);
    await follow(client, blockingViewer.handle).expect(404);

    expect(await followRows(viewer.id, blockedByViewer.id)).toBe('0');
    expect(await followRows(viewer.id, blockingViewer.id)).toBe('0');
  });

  it('answers 204 on DELETE for a target that became suspended, and removes the row that is left', async () => {
    const viewer = await createAccount();
    const target = await createAccount();
    await insertFollow(viewer.id, target.id);
    await sql(`UPDATE users SET status = 'suspended' WHERE id = '${target.id}';`);
    const client = await clientFor(viewer.id);

    await unfollow(client, target.handle).expect(204);

    expect(await followRows(viewer.id, target.id)).toBe('0');
  });

  it('answers 204 on DELETE for a target blocked by the viewer, and removes the row that is left (R14)', async () => {
    const viewer = await createAccount();
    const target = await createAccount();
    await insertFollow(viewer.id, target.id);
    await sql(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${viewer.id}', '${target.id}');`);
    const client = await clientFor(viewer.id);

    await unfollow(client, target.handle).expect(204);

    expect(await followRows(viewer.id, target.id)).toBe('0');
  });

  it('refuses a suspended viewer (403) on both routes, and a request without a session (401)', async () => {
    const target = await createAccount();
    const suspended = await createAccount('suspended');
    const client = await clientFor(suspended.id);

    await follow(client, target.handle).expect(403);
    await unfollow(client, target.handle).expect(403);

    const anonymous = await clientFor(target.id);
    await request(app.getHttpServer())
      .put(`/api/v1/users/${target.handle}/follow`)
      .set('Cookie', `y_csrf=${anonymous.token}`)
      .set('x-csrf-token', anonymous.token)
      .expect(401);
  });

  it('refuses a mutation without the CSRF token (403), and a malformed handle (400)', async () => {
    const viewer = await createAccount();
    const target = await createAccount();
    const client = await clientFor(viewer.id);

    await client.agent.put(`/api/v1/users/${target.handle}/follow`).expect(403);
    await follow(client, 'bad-handle').expect(400);
    await client.agent.get('/api/v1/users/bad-handle/followers').expect(400);

    expect(await followRows(viewer.id, target.id)).toBe('0');
  });

  describe('lists (E5)', () => {
    /** Three visible followers (oldest first), plus one suspended and one blocked by the owner, who are never listed. */
    async function seedFollowers() {
      const owner = await createAccount();
      const first = await createAccount();
      const second = await createAccount();
      const third = await createAccount();
      const suspended = await createAccount('suspended');
      const blocked = await createAccount();
      await insertFollow(first.id, owner.id, '2026-10-01 10:00:01+00');
      await insertFollow(second.id, owner.id, '2026-10-01 10:00:02+00');
      await insertFollow(third.id, owner.id, '2026-10-01 10:00:03+00');
      await insertFollow(suspended.id, owner.id, '2026-10-01 10:00:04+00');
      await insertFollow(blocked.id, owner.id, '2026-10-01 10:00:05+00');
      await sql(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${owner.id}', '${blocked.id}');`);
      const viewer = await createAccount();
      return { owner, viewer, expected: [third, second, first] };
    }

    it('lists the followers newest first, in pages with a cursor, without duplicates or gaps, and leaves out inactive and blocked accounts', async () => {
      const { owner, viewer, expected } = await seedFollowers();
      const client = await clientFor(viewer.id);

      const firstPage = await client.agent.get(`/api/v1/users/${owner.handle}/followers?limit=2`).expect(200);
      expect(firstPage.body.items).toEqual(
        expected.slice(0, 2).map((account) => ({ handle: account.handle, displayName: account.displayName })),
      );
      expect(firstPage.body.nextCursor).toEqual(expect.any(String));

      const secondPage = await client.agent
        .get(
          `/api/v1/users/${owner.handle}/followers?limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`,
        )
        .expect(200);
      expect(secondPage.body.items.map((item: { handle: string }) => item.handle)).toEqual([
        expected[2].handle,
      ]);
      expect(secondPage.body.nextCursor).toBeNull();
    });

    it('lists the accounts that the owner follows the same way', async () => {
      const owner = await createAccount();
      const followed = await createAccount();
      const suspended = await createAccount('suspended');
      await insertFollow(owner.id, followed.id, '2026-10-01 10:00:01+00');
      await insertFollow(owner.id, suspended.id, '2026-10-01 10:00:02+00');
      const viewer = await createAccount();
      const client = await clientFor(viewer.id);

      const response = await client.agent.get(`/api/v1/users/${owner.handle}/following`).expect(200);

      expect(response.body.items.map((item: { handle: string }) => item.handle)).toEqual([followed.handle]);
      expect(response.body.nextCursor).toBeNull();
    });

    it('answers 404 for a list of an account that is suspended, or blocked with the viewer (R13, R14)', async () => {
      const suspended = await createAccount('suspended');
      const blockedWithViewer = await createAccount();
      const viewer = await createAccount();
      await sql(
        `INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${blockedWithViewer.id}', '${viewer.id}');`,
      );
      const client = await clientFor(viewer.id);

      await client.agent.get(`/api/v1/users/${suspended.handle}/followers`).expect(404);
      await client.agent.get(`/api/v1/users/${blockedWithViewer.handle}/following`).expect(404);
    });

    it('refuses an invalid cursor and a limit out of range (400)', async () => {
      const owner = await createAccount();
      const viewer = await createAccount();
      const client = await clientFor(viewer.id);

      await client.agent.get(`/api/v1/users/${owner.handle}/followers?cursor=nope`).expect(400);
      await client.agent.get(`/api/v1/users/${owner.handle}/followers?limit=0`).expect(400);
      await client.agent.get(`/api/v1/users/${owner.handle}/following?limit=51`).expect(400);
    });
  });
});
