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

describe('Mentions and reply notifications (e2e, M3 B8, B9)', () => {
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

  /** A separate cookie jar per user: each one has its own session and its own CSRF cookie. */
  async function clientFor(userId: string): Promise<Client> {
    const agent = request.agent(app.getHttpServer());
    const response = await agent.get('/api/v1/status').expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const token = cookies.find((value) => value.startsWith('y_csrf='))!.split(';')[0].split('=')[1];
    await agent.post(`/api/v1/session-probe/login/${userId}`).set('x-csrf-token', token).expect(201);
    return { userId, agent, token };
  }

  function postQuestion(client: Client, text: string) {
    return client.agent.post('/api/v1/questions').set('x-csrf-token', client.token).send({ text });
  }

  function postReply(client: Client, questionId: string, text: string) {
    return client.agent
      .post(`/api/v1/questions/${questionId}/replies`)
      .set('x-csrf-token', client.token)
      .send({ text });
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

  it('stores one mention per known active account, case-insensitive, and skips the author and unknown handles', async () => {
    const author = await createUser('m_author');
    const bob = await createUser('m_bob');
    const carol = await createUser('m_carol');
    const client = await clientFor(author);

    const created = await postQuestion(client, 'Bonjour @M_BOB, @m_author, @nobody et @m_carol').expect(201);

    const questionId = created.body.id;
    const mentioned = await sql(`SELECT mentioned_user_id FROM mentions WHERE question_id = '${questionId}';`);
    expect(mentioned.split('\n').sort()).toEqual([bob, carol].sort());
    expect(
      await sql(
        `SELECT recipient_id || ',' || actor_id || ',' || type FROM notifications WHERE question_id = '${questionId}' AND type = 'mention' AND recipient_id = '${bob}';`,
      ),
    ).toBe(`${bob},${author},mention`);
  });

  it('refuses the whole question when a mentioned account blocks the author (422, R14), and stores nothing', async () => {
    const author = await createUser('m_blocked_author');
    const blocker = await createUser('m_blocker');
    await sql(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${blocker}', '${author}');`);
    const client = await clientFor(author);

    await postQuestion(client, 'Hé @m_blocker, tu me lis ?').expect(422);

    expect(await sql(`SELECT count(*) FROM questions WHERE author_id = '${author}';`)).toBe('0');
    expect(await sql(`SELECT count(*) FROM mentions WHERE mentioned_user_id = '${blocker}';`)).toBe('0');
  });

  it('does not mention a suspended account: plain text, no row, no error', async () => {
    const author = await createUser('m_sender');
    const suspended = await createUser('m_suspended', 'suspended');
    const client = await clientFor(author);

    const created = await postQuestion(client, 'Au revoir @m_suspended').expect(201);

    expect(await sql(`SELECT count(*) FROM mentions WHERE mentioned_user_id = '${suspended}';`)).toBe('0');
    expect(created.body.id).toEqual(expect.any(String));
  });

  it('stores a reply mention on the reply, and tells the question author with reply_to_question', async () => {
    const questionAuthor = await createUser('m_question_owner');
    const replier = await createUser('m_replier');
    const mentioned = await createUser('m_named');
    const question = await createOpenQuestion(questionAuthor);
    const client = await clientFor(replier);

    const created = await postReply(client, question, 'Oui, voir @m_named').expect(201);

    const replyId = created.body.id;
    expect(
      await sql(`SELECT reply_id || ',' || COALESCE(question_id::text, 'null') FROM mentions WHERE mentioned_user_id = '${mentioned}';`),
    ).toBe(`${replyId},null`);
    expect(
      await sql(
        `SELECT type || ',' || actor_id FROM notifications WHERE reply_id = '${replyId}' AND recipient_id = '${questionAuthor}';`,
      ),
    ).toBe(`reply_to_question,${replier}`);
    expect(
      await sql(`SELECT type || ',' || actor_id FROM notifications WHERE reply_id = '${replyId}' AND recipient_id = '${mentioned}';`),
    ).toBe(`mention,${replier}`);
  });

  it('gives the question author one notification when a reply mentions them, not two', async () => {
    const questionAuthor = await createUser('m_both_owner');
    const replier = await createUser('m_both_replier');
    const question = await createOpenQuestion(questionAuthor);
    const client = await clientFor(replier);

    const created = await postReply(client, question, 'Merci @m_both_owner').expect(201);

    expect(
      await sql(`SELECT type FROM notifications WHERE reply_id = '${created.body.id}' AND recipient_id = '${questionAuthor}';`),
    ).toBe('mention');
  });

  it('notifies nobody for the author replying to their own question', async () => {
    const owner = await createUser('m_self_owner');
    const question = await createOpenQuestion(owner);
    const client = await clientFor(owner);

    const created = await postReply(client, question, 'Ma précision').expect(201);

    expect(await sql(`SELECT count(*) FROM notifications WHERE reply_id = '${created.body.id}';`)).toBe('0');
  });

  it('refuses a reply that mentions a blocking account (422) and does not count it', async () => {
    const questionAuthor = await createUser('m_reply_owner');
    const replier = await createUser('m_reply_author');
    const blocker = await createUser('m_reply_blocker');
    await sql(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${blocker}', '${replier}');`);
    const question = await createOpenQuestion(questionAuthor);
    const client = await clientFor(replier);

    await postReply(client, question, 'Bonjour @m_reply_blocker').expect(422);

    expect(await sql(`SELECT count(*) FROM replies WHERE question_id = '${question}';`)).toBe('0');
    expect(await sql(`SELECT reply_count FROM questions WHERE id = '${question}';`)).toBe('0');
    expect(await sql(`SELECT count(*) FROM notifications WHERE question_id = '${question}';`)).toBe('0');
  });
});
