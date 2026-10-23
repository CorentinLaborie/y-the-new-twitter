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

interface Line {
  readonly id: string;
  readonly type: string;
  readonly readAt: string | null;
  readonly actorCount: number;
  readonly actor: { readonly handle: string } | null;
  readonly question: { readonly id: string } | null;
}

describe('Notifications (e2e, L2 step 3)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;

  function sql(statement: string): Promise<string> {
    return runAsSuperuser(container, statement).then((result) => result.stdout.trim());
  }

  async function createUser(handle: string, status: 'active' | 'suspended' = 'active'): Promise<string> {
    const [id] = (
      await sql(
        `INSERT INTO users (handle, display_name, email, password_hash, status, terms_accepted_at, terms_version)
         VALUES ('${handle}', '${handle}', '${handle}@example.test', 'hash', '${status}', now(), '1.0')
         RETURNING id;`,
      )
    ).split('\n');
    return id;
  }

  async function createQuestion(authorId: string, moderation = 'visible'): Promise<string> {
    const [id] = (
      await sql(
        `INSERT INTO questions (author_id, body, moderation_status)
         VALUES ('${authorId}', 'Une question', '${moderation}')
         RETURNING id;`,
      )
    ).split('\n');
    return id;
  }

  /** A reaction notification written at `minutesAgo` minutes before now, so the order is fixed. */
  async function reaction(recipientId: string, actorId: string, questionId: string, minutesAgo: number, type = 'reaction_like') {
    await sql(
      `INSERT INTO notifications (recipient_id, actor_id, type, question_id, created_at)
       VALUES ('${recipientId}', '${actorId}', '${type}', '${questionId}', now() - interval '${minutesAgo} minutes');`,
    );
  }

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

  it('lists only the viewer notifications, newest first', async () => {
    const owner = await createUser('n_owner');
    const other = await createUser('n_other');
    const bob = await createUser('n_bob');
    const question = await createQuestion(owner);
    await reaction(owner, bob, question, 10);
    await reaction(other, bob, question, 5);
    const client = await clientFor(owner);

    const response = await client.agent.get('/api/v1/notifications').expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].actor.handle).toBe('n_bob');
    expect(response.body.nextCursor).toBeNull();
  });

  it('groups the reactions of one kind on one question into one line, with the count of actors', async () => {
    const owner = await createUser('g_owner');
    const ann = await createUser('g_ann');
    const ben = await createUser('g_ben');
    const carl = await createUser('g_carl');
    const question = await createQuestion(owner);
    await reaction(owner, ann, question, 30);
    await reaction(owner, ben, question, 20);
    await reaction(owner, carl, question, 10);
    const client = await clientFor(owner);

    const response = await client.agent.get('/api/v1/notifications').expect(200);

    const lines: Line[] = response.body.items;
    expect(lines).toHaveLength(1);
    expect(lines[0].actorCount).toBe(3);
    expect(lines[0].actor?.handle).toBe('g_carl');
  });

  it('pages through the lines without repeating or skipping one', async () => {
    const owner = await createUser('p_owner');
    const actors = await Promise.all(['p_a', 'p_b', 'p_c'].map((handle) => createUser(handle)));
    const questions = await Promise.all([createQuestion(owner), createQuestion(owner), createQuestion(owner)]);
    for (let index = 0; index < 3; index += 1) {
      await reaction(owner, actors[index], questions[index], 30 - index * 5);
    }
    const client = await clientFor(owner);

    const first = await client.agent.get('/api/v1/notifications?limit=2').expect(200);
    const second = await client.agent
      .get(`/api/v1/notifications?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`)
      .expect(200);

    const ids = [...first.body.items, ...second.body.items].map((line: Line) => line.id);
    expect(first.body.items).toHaveLength(2);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    expect(new Set(ids).size).toBe(3);
  });

  it('a reaction from another account appears for the author, and its own reaction does not', async () => {
    const author = await createUser('x_author');
    const fan = await createUser('x_fan');
    const question = await createQuestion(author);
    const fanClient = await clientFor(fan);
    const authorClient = await clientFor(author);

    await fanClient.agent.put(`/api/v1/questions/${question}/reactions/like`).set('x-csrf-token', fanClient.token).expect(200);
    await authorClient.agent
      .put(`/api/v1/questions/${question}/reactions/y`)
      .set('x-csrf-token', authorClient.token)
      .expect(200);

    const response = await authorClient.agent.get('/api/v1/notifications').expect(200);

    expect(response.body.items.map((line: Line) => [line.type, line.actor?.handle])).toEqual([
      ['reaction_like', 'x_fan'],
    ]);
  });

  it('answers 400 for an invalid cursor, an unknown tab and an invalid limit', async () => {
    const owner = await createUser('v_owner');
    const client = await clientFor(owner);

    await client.agent.get('/api/v1/notifications?cursor=pas-un-curseur').expect(400);
    await client.agent.get('/api/v1/notifications?type=follow').expect(400);
    await client.agent.get('/api/v1/notifications?limit=0').expect(400);
  });

  it('the Mentions tab shows only mention notifications', async () => {
    const owner = await createUser('m_owner');
    const bob = await createUser('m_bob');
    const question = await createQuestion(owner);
    await reaction(owner, bob, question, 10);
    await sql(
      `INSERT INTO notifications (recipient_id, actor_id, type, question_id)
       VALUES ('${owner}', '${bob}', 'mention', '${question}');`,
    );
    const client = await clientFor(owner);

    const response = await client.agent.get('/api/v1/notifications?type=mention').expect(200);

    expect(response.body.items.map((line: Line) => line.type)).toEqual(['mention']);
  });

  it('counts a reaction group once in the unread count', async () => {
    const owner = await createUser('u_owner');
    const ann = await createUser('u_ann');
    const ben = await createUser('u_ben');
    const question = await createQuestion(owner);
    await reaction(owner, ann, question, 20);
    await reaction(owner, ben, question, 10);
    const client = await clientFor(owner);

    expect((await client.agent.get('/api/v1/notifications/unread-count').expect(200)).body).toEqual({ unread: 1 });
  });

  it('hides a line whose actor the viewer has blocked, in either direction', async () => {
    const owner = await createUser('b_owner');
    const blocked = await createUser('b_blocked');
    const question = await createQuestion(owner);
    await reaction(owner, blocked, question, 10);
    await sql(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${owner}', '${blocked}');`);
    const client = await clientFor(owner);

    const response = await client.agent.get('/api/v1/notifications').expect(200);

    expect(response.body.items).toEqual([]);
  });

  it('hides a line whose question is hidden, and keeps it in the database', async () => {
    const owner = await createUser('h_owner');
    const ann = await createUser('h_ann');
    const question = await createQuestion(owner, 'hidden');
    await reaction(owner, ann, question, 10);
    const client = await clientFor(owner);

    const response = await client.agent.get('/api/v1/notifications').expect(200);

    expect(response.body.items).toEqual([]);
    expect(await sql(`SELECT count(*) FROM notifications WHERE recipient_id = '${owner}';`)).toBe('1');
  });

  it('answers an empty list and a count of 0 to a suspended account', async () => {
    const owner = await createUser('s_owner', 'suspended');
    const ann = await createUser('s_ann');
    const question = await createQuestion(owner);
    await reaction(owner, ann, question, 10);
    const client = await clientFor(owner);

    expect((await client.agent.get('/api/v1/notifications').expect(200)).body).toEqual({
      items: [],
      nextCursor: null,
    });
    expect((await client.agent.get('/api/v1/notifications/unread-count').expect(200)).body).toEqual({ unread: 0 });
  });

  it('marks every unread line as read, and a second call changes nothing', async () => {
    const owner = await createUser('r_owner');
    const ann = await createUser('r_ann');
    const ben = await createUser('r_ben');
    const question = await createQuestion(owner);
    await reaction(owner, ann, question, 20);
    await reaction(owner, ben, question, 10, 'reaction_y');
    const client = await clientFor(owner);

    await client.agent.post('/api/v1/notifications/read-all').set('x-csrf-token', client.token).expect(204);
    await client.agent.post('/api/v1/notifications/read-all').set('x-csrf-token', client.token).expect(204);

    expect((await client.agent.get('/api/v1/notifications/unread-count').expect(200)).body).toEqual({ unread: 0 });
    expect(await sql(`SELECT count(*) FROM notifications WHERE recipient_id = '${owner}' AND read_at IS NULL;`)).toBe(
      '0',
    );
  });

  it('marks only the lines whose ids the page sent, and ignores ids of other lines', async () => {
    const owner = await createUser('r_shown_owner');
    const ann = await createUser('r_shown_ann');
    const ben = await createUser('r_shown_ben');
    const question = await createQuestion(owner);
    await reaction(owner, ann, question, 20);
    await reaction(owner, ben, question, 10, 'reaction_y');
    const client = await clientFor(owner);
    const shown = (await client.agent.get('/api/v1/notifications').expect(200)).body.items[0].id;

    await client.agent
      .post('/api/v1/notifications/read-all')
      .set('x-csrf-token', client.token)
      .send({ ids: ['00000000-0000-4000-8000-000000000000'] })
      .expect(204);
    expect((await client.agent.get('/api/v1/notifications/unread-count').expect(200)).body).toEqual({ unread: 2 });

    await client.agent
      .post('/api/v1/notifications/read-all')
      .set('x-csrf-token', client.token)
      .send({ ids: [shown] })
      .expect(204);
    expect((await client.agent.get('/api/v1/notifications/unread-count').expect(200)).body).toEqual({ unread: 1 });
  });

  it('marks a reaction group read when the page sends its line, even if the line hides older reactions', async () => {
    const owner = await createUser('r_group_owner');
    const ann = await createUser('r_group_ann');
    const ben = await createUser('r_group_ben');
    const question = await createQuestion(owner);
    await reaction(owner, ann, question, 20);
    await reaction(owner, ben, question, 10);
    const client = await clientFor(owner);
    const lines = (await client.agent.get('/api/v1/notifications').expect(200)).body.items;
    expect(lines).toHaveLength(1);
    expect((await client.agent.get('/api/v1/notifications/unread-count').expect(200)).body).toEqual({ unread: 1 });

    await client.agent
      .post('/api/v1/notifications/read-all')
      .set('x-csrf-token', client.token)
      .send({ ids: [lines[0].id] })
      .expect(204);

    expect((await client.agent.get('/api/v1/notifications/unread-count').expect(200)).body).toEqual({ unread: 0 });
    expect(await sql(`SELECT count(*) FROM notifications WHERE recipient_id = '${owner}' AND read_at IS NULL;`)).toBe(
      '0',
    );
  });

  it('refuses an ids list that is not a list of UUIDs', async () => {
    const owner = await createUser('r_bad_ids');
    const client = await clientFor(owner);

    await client.agent
      .post('/api/v1/notifications/read-all')
      .set('x-csrf-token', client.token)
      .send({ ids: ['pas-un-uuid'] })
      .expect(400);
    await client.agent
      .post('/api/v1/notifications/read-all')
      .set('x-csrf-token', client.token)
      .send({ ids: null })
      .expect(400);
  });

  it('marks nothing for an empty ids list, and never the lines of another user', async () => {
    const owner = await createUser('r_iso_owner');
    const intruder = await createUser('r_iso_intruder');
    const ann = await createUser('r_iso_ann');
    const question = await createQuestion(owner);
    await reaction(owner, ann, question, 20);
    const ownerClient = await clientFor(owner);
    const intruderClient = await clientFor(intruder);
    const shown = (await ownerClient.agent.get('/api/v1/notifications').expect(200)).body.items[0].id;

    await ownerClient.agent
      .post('/api/v1/notifications/read-all')
      .set('x-csrf-token', ownerClient.token)
      .send({ ids: [] })
      .expect(204);
    expect((await ownerClient.agent.get('/api/v1/notifications/unread-count').expect(200)).body).toEqual({ unread: 1 });

    await intruderClient.agent
      .post('/api/v1/notifications/read-all')
      .set('x-csrf-token', intruderClient.token)
      .send({ ids: [shown] })
      .expect(204);
    expect((await ownerClient.agent.get('/api/v1/notifications/unread-count').expect(200)).body).toEqual({ unread: 1 });
  });

  it('refuses read-all to a suspended account, and without the CSRF token', async () => {
    const suspended = await createUser('r_suspended', 'suspended');
    const client = await clientFor(suspended);

    await client.agent.post('/api/v1/notifications/read-all').set('x-csrf-token', client.token).expect(403);
    await client.agent.post('/api/v1/notifications/read-all').expect(403);
  });

  it('answers 401 without a session', async () => {
    await request(app.getHttpServer()).get('/api/v1/notifications').expect(401);
  });
});
