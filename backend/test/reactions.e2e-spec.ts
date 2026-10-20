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

type Kind = 'like' | 'dislike' | 'y';
interface Client {
  readonly userId: string;
  readonly agent: ReturnType<typeof request.agent>;
  readonly token: string;
}

describe('Question reactions (e2e, B3 to B5)', () => {
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
         VALUES ('reactor_${counter}', 'Reactor ${counter}', 'reactor-${counter}@example.test', 'hash', '${status}', now(), '1.0')
         RETURNING id;`,
      )
    ).split('\n');
    return id;
  }

  async function createQuestion(authorId: string, extra = ''): Promise<string> {
    const [id] = (
      await sql(
        `INSERT INTO questions (author_id, body ${extra ? ', moderation_status, deleted_at' : ''})
         VALUES ('${authorId}', 'Une question' ${extra})
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

  function put(client: Client, questionId: string, kind: string) {
    return client.agent
      .put(`/api/v1/questions/${questionId}/reactions/${kind}`)
      .set('x-csrf-token', client.token);
  }

  function remove(client: Client, questionId: string, kind: string) {
    return client.agent
      .delete(`/api/v1/questions/${questionId}/reactions/${kind}`)
      .set('x-csrf-token', client.token);
  }

  function counters(questionId: string): Promise<string> {
    return sql(
      `SELECT like_count || ',' || dislike_count || ',' || y_count FROM questions WHERE id = '${questionId}';`,
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

  it("sets a reaction on one's own question (R13) and returns the counters and the Y progress", async () => {
    const author = await createUser();
    const question = await createQuestion(author);
    const client = await clientFor(author);

    const response = await put(client, question, 'like').expect(200);

    expect(response.body).toEqual({
      questionId: question,
      counters: { like: 1, dislike: 0, y: 0 },
      viewerReactions: ['like'],
      yThreshold: 50,
      conversationOpen: false,
    });
  });

  it('replaces the previous reaction of the viewer (R11), and repeating a kind changes nothing', async () => {
    const author = await createUser();
    const question = await createQuestion(author);
    const client = await clientFor(author);

    await put(client, question, 'like').expect(200);
    const replaced = await put(client, question, 'dislike').expect(200);
    const repeated = await put(client, question, 'dislike').expect(200);

    expect(replaced.body.counters).toEqual({ like: 0, dislike: 1, y: 0 });
    expect(repeated.body).toEqual(replaced.body);
    expect(await counters(question)).toBe('0,1,0');
    expect(await sql(`SELECT count(*) FROM question_reactions WHERE question_id = '${question}';`)).toBe('1');
  });

  it('keeps the day a reaction was placed when it changes, so the 24-hour ranking counts it by that day (DEC-164)', async () => {
    const author = await createUser();
    const question = await createQuestion(author);
    const client = await clientFor(author);
    await put(client, question, 'like').expect(200);
    await sql(
      `UPDATE question_reactions SET created_at = now() - interval '2 days' WHERE question_id = '${question}';`,
    );

    await put(client, question, 'dislike').expect(200);

    expect(
      await sql(
        `SELECT created_at < now() - interval '1 day' FROM question_reactions WHERE question_id = '${question}';`,
      ),
    ).toBe('t');
  });

  it('removes a reaction of the kind named in the request, and ignores another kind', async () => {
    const author = await createUser();
    const question = await createQuestion(author);
    const client = await clientFor(author);
    await put(client, question, 'y').expect(200);

    await remove(client, question, 'like').expect(204);
    expect(await counters(question)).toBe('0,0,1');

    await remove(client, question, 'y').expect(204);
    expect(await counters(question)).toBe('0,0,0');
    expect(await sql(`SELECT count(*) FROM question_reactions WHERE question_id = '${question}';`)).toBe('0');
  });

  it('refuses an unknown kind (400) and a question id that is not a UUID (400)', async () => {
    const author = await createUser();
    const question = await createQuestion(author);
    const client = await clientFor(author);

    await put(client, question, 'love').expect(400);
    await put(client, 'pas-un-uuid', 'like').expect(400);
  });

  it('refuses a missing, hidden or deleted question (404), and nothing is stored', async () => {
    const author = await createUser();
    const hidden = await createQuestion(author, `, 'hidden', NULL`);
    const deleted = await createQuestion(author, `, 'visible', now()`);
    const client = await clientFor(author);

    await put(client, '0f8c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f', 'like').expect(404);
    await put(client, hidden, 'like').expect(404);
    await put(client, deleted, 'like').expect(404);
    expect(await sql(`SELECT count(*) FROM question_reactions WHERE user_id = '${author}';`)).toBe('0');
  });

  it('refuses a question when either account has blocked the other (404, R14), and stores nothing', async () => {
    const author = await createUser();
    const question = await createQuestion(author);
    const blockedByAuthor = await clientFor(await createUser());
    const blockingAuthor = await clientFor(await createUser());
    await sql(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${author}', '${blockedByAuthor.userId}');`,
    );
    await sql(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${blockingAuthor.userId}', '${author}');`,
    );

    await put(blockedByAuthor, question, 'like').expect(404);
    await put(blockingAuthor, question, 'like').expect(404);

    expect(await counters(question)).toBe('0,0,0');
  });

  it('refuses a suspended account (403) and a request without a session (401)', async () => {
    const author = await createUser();
    const question = await createQuestion(author);
    const suspended = await createUser('suspended');
    const client = await clientFor(suspended);

    await put(client, question, 'like').expect(403);

    const anonymous = await clientFor(author);
    await request(app.getHttpServer())
      .put(`/api/v1/questions/${question}/reactions/like`)
      .set('Cookie', `y_csrf=${anonymous.token}`)
      .set('x-csrf-token', anonymous.token)
      .expect(401);
  });

  it('reports the Y count against yThreshold, and opens the conversation at 50 (B5, R3)', async () => {
    const author = await createUser();
    const question = await createQuestion(author);
    await sql(`UPDATE questions SET y_count = 49 WHERE id = '${question}';`);
    const first = await clientFor(await createUser());
    const second = await clientFor(await createUser());

    const before = await put(first, question, 'like').expect(200);
    const reaching = await put(second, question, 'y').expect(200);

    expect(before.body).toMatchObject({ counters: { y: 49 }, yThreshold: 50, conversationOpen: false });
    expect(reaching.body).toMatchObject({ counters: { y: 50 }, yThreshold: 50, conversationOpen: true });
  });

  it('writes one conversation_opened notice to the author when the Y count reaches 50, and none after (B2)', async () => {
    const author = await createUser();
    const question = await createQuestion(author);
    await sql(`UPDATE questions SET y_count = 49 WHERE id = '${question}';`);
    const first = await clientFor(await createUser());
    const second = await clientFor(await createUser());
    const third = await clientFor(await createUser());

    await put(first, question, 'y').expect(200);
    await put(second, question, 'y').expect(200);
    await put(third, question, 'y').expect(200);

    expect(
      await sql(
        `SELECT count(*) || ',' || max(recipient_id::text) || ',' || coalesce(max(actor_id::text), 'null')
         FROM notifications WHERE type = 'conversation_opened' AND question_id = '${question}';`,
      ),
    ).toBe(`1,${author},null`);
  });

  it('keeps the counters equal to the rows under parallel reactions from several users (B4)', async () => {
    const author = await createUser();
    const question = await createQuestion(author);
    const kinds: Kind[] = ['like', 'dislike', 'y'];
    const clients = await Promise.all(Array.from({ length: 6 }, async () => clientFor(await createUser())));

    // Every user runs in parallel with the others: PUT of a kind, then DELETE of a kind, in turn.
    await Promise.all(
      clients.map(async (client, index) => {
        for (let step = 0; step < 12; step += 1) {
          const kind = kinds[(index + step) % 3];
          if (step % 3 === 2) {
            await remove(client, question, kind).expect(204);
          } else {
            await put(client, question, kind).expect(200);
          }
        }
      }),
    );

    const rows = await sql(
      `SELECT count(*) FILTER (WHERE kind = 'like') || ',' || count(*) FILTER (WHERE kind = 'dislike') || ',' ||
              count(*) FILTER (WHERE kind = 'y')
       FROM question_reactions WHERE question_id = '${question}';`,
    );
    expect(await counters(question)).toBe(rows);
    expect(
      await sql(
        `SELECT max(c) FROM (SELECT count(*) AS c FROM question_reactions WHERE question_id = '${question}' GROUP BY user_id) t;`,
      ),
    ).toBe('1');
  });
});
