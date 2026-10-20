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

type ReplyKind = 'like' | 'dislike';
interface Client {
  readonly userId: string;
  readonly agent: ReturnType<typeof request.agent>;
  readonly token: string;
}

describe('Replies and reply reactions (e2e, M3 B3 to B7)', () => {
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
         VALUES ('replier_${counter}', 'Replier ${counter}', 'replier-${counter}@example.test', 'hash', '${status}', now(), '1.0')
         RETURNING id;`,
      )
    ).split('\n');
    return id;
  }

  /** A question whose conversation is open (50 Y reached, R3). */
  async function createOpenQuestion(authorId: string): Promise<string> {
    const [id] = (
      await sql(
        `INSERT INTO questions (author_id, body, y_count, conversation_opened_at)
         VALUES ('${authorId}', 'Une question', 50, now())
         RETURNING id;`,
      )
    ).split('\n');
    return id;
  }

  async function createClosedQuestion(authorId: string): Promise<string> {
    const [id] = (
      await sql(
        `INSERT INTO questions (author_id, body, y_count) VALUES ('${authorId}', 'Une question', 49) RETURNING id;`,
      )
    ).split('\n');
    return id;
  }

  /** A separate cookie jar per user: each one has its own session and its own CSRF cookie. */
  async function clientFor(userId: string): Promise<Client> {
    const agent = request.agent(app.getHttpServer());
    const response = await agent.get('/api/v1/status').expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const token = cookies.find((value) => value.startsWith('y_csrf='))!.split(';')[0].split('=')[1];
    await agent.post(`/api/v1/session-probe/login/${userId}`).set('x-csrf-token', token).expect(201);
    return { userId, agent, token };
  }

  function postReply(client: Client, questionId: string, text: string, key?: string) {
    const call = client.agent.post(`/api/v1/questions/${questionId}/replies`).set('x-csrf-token', client.token);
    return (key === undefined ? call : call.set('idempotency-key', key)).send({ text });
  }

  function putReaction(client: Client, replyId: string, kind: ReplyKind) {
    return client.agent.put(`/api/v1/replies/${replyId}/reactions/${kind}`).set('x-csrf-token', client.token);
  }

  function removeReaction(client: Client, replyId: string, kind: ReplyKind) {
    return client.agent.delete(`/api/v1/replies/${replyId}/reactions/${kind}`).set('x-csrf-token', client.token);
  }

  function counters(replyId: string): Promise<string> {
    return sql(`SELECT like_count || ',' || dislike_count FROM replies WHERE id = '${replyId}';`);
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

  it('refuses a reply while the conversation is closed (422, R3) and stores nothing', async () => {
    const author = await createUser();
    const question = await createClosedQuestion(author);
    const replier = await clientFor(await createUser());

    const refused = await postReply(replier, question, 'Trop tôt').expect(422);

    expect(refused.body.detail).toBe('Les réponses s’ouvrent à 50 Y.');
    expect(await sql(`SELECT count(*) FROM replies WHERE question_id = '${question}';`)).toBe('0');
  });

  it('accepts a reply once the conversation is open (201, Location) and counts it', async () => {
    const author = await createUser();
    const question = await createOpenQuestion(author);
    const replier = await clientFor(await createUser());

    const created = await postReply(replier, question, '  Une réponse  ').expect(201);

    expect(created.headers.location).toBe(`/api/v1/replies/${created.body.id}`);
    expect(created.body).toMatchObject({
      questionId: question,
      text: 'Une réponse',
      counters: { like: 0, dislike: 0 },
      viewerReactions: [],
      author: { handle: expect.any(String) },
    });
    expect(await sql(`SELECT reply_count FROM questions WHERE id = '${question}';`)).toBe('1');
  });

  it('accepts 280 characters and refuses 281 (422), with nothing stored for the refusal', async () => {
    const author = await createUser();
    const question = await createOpenQuestion(author);
    const replier = await clientFor(await createUser());

    await postReply(replier, question, 'a'.repeat(280)).expect(201);
    await postReply(replier, question, 'a'.repeat(281)).expect(422);

    expect(await sql(`SELECT count(*) FROM replies WHERE question_id = '${question}';`)).toBe('1');
  });

  it('refuses a reply to a question whose author has blocked the replier (404, R14)', async () => {
    const author = await createUser();
    const question = await createOpenQuestion(author);
    const replier = await clientFor(await createUser());
    await sql(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${author}', '${replier.userId}');`);

    await postReply(replier, question, 'Bloqué').expect(404);
  });

  it('replays the first reply for the same key on the same question, and refuses the key on another request (422)', async () => {
    const author = await createUser();
    const question = await createOpenQuestion(author);
    const otherQuestion = await createOpenQuestion(author);
    const replier = await clientFor(await createUser());

    const first = await postReply(replier, question, 'Une seule fois', 'reply-key-1').expect(201);
    const again = await postReply(replier, question, 'Une seule fois', 'reply-key-1').expect(201);
    expect(again.body.id).toBe(first.body.id);
    expect(await sql(`SELECT count(*) FROM replies WHERE question_id = '${question}';`)).toBe('1');

    await postReply(replier, otherQuestion, 'Une seule fois', 'reply-key-1').expect(422);
  });

  it('refuses a question key reused on a reply (422, DEC-185)', async () => {
    const author = await createUser();
    const question = await createOpenQuestion(author);
    const writer = await clientFor(author);

    await writer.agent
      .post('/api/v1/questions')
      .set('x-csrf-token', writer.token)
      .set('idempotency-key', 'shared-key')
      .send({ text: 'Bonjour' })
      .expect(201);

    await postReply(writer, question, 'Bonjour', 'shared-key').expect(422);
  });

  it('lists replies oldest first, one page at a time, with no repeat and no gap (cursor, section 9.1)', async () => {
    const author = await createUser();
    const question = await createOpenQuestion(author);
    const viewer = await clientFor(await createUser());
    for (let index = 1; index <= 5; index += 1) {
      await sql(
        `INSERT INTO replies (question_id, author_id, body, created_at)
         VALUES ('${question}', '${author}', 'Réponse ${index}', now() - interval '${6 - index} minutes');`,
      );
    }

    const first = await viewer.agent.get(`/api/v1/questions/${question}/replies?limit=2`).expect(200);
    const second = await viewer.agent
      .get(`/api/v1/questions/${question}/replies?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`)
      .expect(200);
    const third = await viewer.agent
      .get(`/api/v1/questions/${question}/replies?limit=2&cursor=${encodeURIComponent(second.body.nextCursor)}`)
      .expect(200);

    const texts = [...first.body.items, ...second.body.items, ...third.body.items].map((reply: { text: string }) => reply.text);
    expect(texts).toEqual(['Réponse 1', 'Réponse 2', 'Réponse 3', 'Réponse 4', 'Réponse 5']);
    expect(third.body.nextCursor).toBeNull();
  });

  it('hides a deleted reply from the list, and the author can delete it only once (204, then 404)', async () => {
    const author = await createUser();
    const question = await createOpenQuestion(author);
    const replier = await clientFor(await createUser());
    const created = await postReply(replier, question, 'À supprimer').expect(201);

    await replier.agent.delete(`/api/v1/replies/${created.body.id}`).set('x-csrf-token', replier.token).expect(204);
    await replier.agent.delete(`/api/v1/replies/${created.body.id}`).set('x-csrf-token', replier.token).expect(404);

    const page = await replier.agent.get(`/api/v1/questions/${question}/replies`).expect(200);
    expect(page.body.items).toEqual([]);
    expect(await sql(`SELECT reply_count FROM questions WHERE id = '${question}';`)).toBe('0');
  });

  it('answers 404 to the deletion of a reply by another account, as for a missing reply, and deletes nothing', async () => {
    const author = await createUser();
    const question = await createOpenQuestion(author);
    const replier = await clientFor(await createUser());
    const other = await clientFor(await createUser());
    const created = await postReply(replier, question, 'Pas à toi').expect(201);

    await other.agent.delete(`/api/v1/replies/${created.body.id}`).set('x-csrf-token', other.token).expect(404);

    expect(await sql(`SELECT deleted_at IS NULL FROM replies WHERE id = '${created.body.id}';`)).toBe('t');
  });

  it('keeps like and dislike independent on a reply: removing one leaves the other (R2)', async () => {
    const author = await createUser();
    const question = await createOpenQuestion(author);
    const replier = await clientFor(await createUser());
    const reply = await postReply(replier, question, 'Deux avis').expect(201);

    await putReaction(replier, reply.body.id, 'like').expect(200);
    const both = await putReaction(replier, reply.body.id, 'dislike').expect(200);
    expect(both.body).toMatchObject({ replyId: reply.body.id, counts: { like: 1, dislike: 1 } });
    expect(both.body.viewerReactions.sort()).toEqual(['dislike', 'like']);

    await removeReaction(replier, reply.body.id, 'like').expect(204);

    expect(await counters(reply.body.id)).toBe('0,1');
  });

  it('keeps the reply counters equal to the rows under parallel reactions from several users (B7)', async () => {
    const author = await createUser();
    const question = await createOpenQuestion(author);
    const reply = await postReply(await clientFor(await createUser()), question, 'Très suivie').expect(201);
    const kinds: ReplyKind[] = ['like', 'dislike'];
    const clients = await Promise.all(Array.from({ length: 6 }, async () => clientFor(await createUser())));

    await Promise.all(
      clients.map(async (client, index) => {
        for (let step = 0; step < 8; step += 1) {
          const kind = kinds[(index + step) % 2];
          if (step % 3 === 2) {
            await removeReaction(client, reply.body.id, kind).expect(204);
          } else {
            await putReaction(client, reply.body.id, kind).expect(200);
          }
        }
      }),
    );

    const rows = await sql(
      `SELECT count(*) FILTER (WHERE kind = 'like') || ',' || count(*) FILTER (WHERE kind = 'dislike')
       FROM reply_reactions WHERE reply_id = '${reply.body.id}';`,
    );
    expect(await counters(reply.body.id)).toBe(rows);
  }, 30_000);
});
