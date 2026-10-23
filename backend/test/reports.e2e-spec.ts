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

describe('Reports (e2e, L6 S1)', () => {
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

  /** Creates an account in the given status. The id is the first line: psql prints the command tag after it. */
  async function createUser(status: 'active' | 'suspended'): Promise<string> {
    counter += 1;
    const [id] = (
      await sql(
        `INSERT INTO users (handle, display_name, email, password_hash, status, terms_accepted_at, terms_version)
         VALUES ('reporter_${counter}', 'Reporter ${counter}', 'reporter-${counter}@example.test', 'hash', '${status}', now(), '1.0')
         RETURNING id;`,
      )
    ).split('\n');
    return id;
  }

  /** Starts a session for the user, through the probe route. */
  async function loginAs(userId: string): Promise<void> {
    const token = await csrfToken();
    await agent.post(`/api/v1/session-probe/login/${userId}`).set('x-csrf-token', token).expect(201);
  }

  /** A question written by the logged-in account, as the API creates it. */
  async function writeQuestion(text: string): Promise<string> {
    const response = await agent.post('/api/v1/questions').set('x-csrf-token', csrf!).send({ text }).expect(201);

    return response.body.id;
  }

  /** A reply written straight in the database: the conversation is closed for the API at this point. */
  async function insertReply(questionId: string, authorId: string): Promise<string> {
    const [id] = (
      await sql(
        `INSERT INTO replies (question_id, author_id, body) VALUES ('${questionId}', '${authorId}', 'Réponse') RETURNING id;`,
      )
    ).split('\n');
    return id;
  }

  function postReport(body: Record<string, unknown>, key?: string) {
    const call = agent.post('/api/v1/reports').set('x-csrf-token', csrf!);
    return (key === undefined ? call : call.set('Idempotency-Key', key)).send(body);
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

  it('records a report on another account’s question as open (201, Location, one row)', async () => {
    const author = await createUser('active');
    await loginAs(author);
    const questionId = await writeQuestion('Une question à signaler');
    const reporter = await createUser('active');
    await loginAs(reporter);

    const response = await postReport({ questionId, reason: 'spam' }).expect(201);

    expect(response.body).toMatchObject({ status: 'open' });
    expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.location).toBe(`/api/v1/reports/${response.body.id}`);
    expect(
      await sql(`SELECT count(*) FROM reports WHERE reporter_id = '${reporter}' AND question_id = '${questionId}';`),
    ).toBe('1');
  });

  it('keeps every report of the same content by the same account (no unique row, no 409)', async () => {
    const author = await createUser('active');
    await loginAs(author);
    const questionId = await writeQuestion('Une question signalée deux fois');
    const reporter = await createUser('active');
    await loginAs(reporter);

    await postReport({ questionId, reason: 'harassment' }).expect(201);
    await postReport({ questionId, reason: 'harassment' }).expect(201);

    expect(
      await sql(`SELECT count(*) FROM reports WHERE reporter_id = '${reporter}' AND question_id = '${questionId}';`),
    ).toBe('2');
  });

  it('records a report on a reply, with its details', async () => {
    const author = await createUser('active');
    await loginAs(author);
    const questionId = await writeQuestion('Une question avec une réponse');
    const replyId = await insertReply(questionId, author);
    const reporter = await createUser('active');
    await loginAs(reporter);

    await postReport({ replyId, reason: 'other', details: '  Propos trompeurs  ' }).expect(201);

    expect(
      await sql(`SELECT details FROM reports WHERE reporter_id = '${reporter}' AND reply_id = '${replyId}';`),
    ).toBe('Propos trompeurs');
  });

  it('refuses other without details (422), and stores nothing', async () => {
    const author = await createUser('active');
    await loginAs(author);
    const questionId = await writeQuestion('Une question pour le motif autre');
    const reporter = await createUser('active');
    await loginAs(reporter);

    const response = await postReport({ questionId, reason: 'other' }).expect(422);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(await sql(`SELECT count(*) FROM reports WHERE reporter_id = '${reporter}';`)).toBe('0');
  });

  it('refuses a report with no target or two targets (400)', async () => {
    const reporter = await createUser('active');
    await loginAs(reporter);

    await postReport({ reason: 'spam' }).expect(400);
    await postReport({ questionId: '0f8c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f', replyId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', reason: 'spam' }).expect(400);
  });

  it('refuses to report one’s own question (422)', async () => {
    const author = await createUser('active');
    await loginAs(author);
    const questionId = await writeQuestion('Ma propre question');

    await postReport({ questionId, reason: 'spam' }).expect(422);
  });

  it('answers a hidden question as missing (404), with nothing stored', async () => {
    const author = await createUser('active');
    await loginAs(author);
    const questionId = await writeQuestion('Une question masquée');
    await sql(`UPDATE questions SET moderation_status = 'hidden' WHERE id = '${questionId}';`);
    const reporter = await createUser('active');
    await loginAs(reporter);

    await postReport({ questionId, reason: 'spam' }).expect(404);
    expect(await sql(`SELECT count(*) FROM reports WHERE reporter_id = '${reporter}';`)).toBe('0');
  });

  it('answers the question of an account that blocked the reporter as missing (404)', async () => {
    const author = await createUser('active');
    await loginAs(author);
    const questionId = await writeQuestion('Une question de quelqu’un qui m’a bloqué');
    const reporter = await createUser('active');
    await sql(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${author}', '${reporter}');`);
    await loginAs(reporter);

    await postReport({ questionId, reason: 'spam' }).expect(404);
  });

  it('refuses a suspended account (403)', async () => {
    const author = await createUser('active');
    await loginAs(author);
    const questionId = await writeQuestion('Une question signalée par un compte suspendu');
    const suspended = await createUser('suspended');
    await loginAs(suspended);

    await postReport({ questionId, reason: 'spam' }).expect(403);
  });

  it('returns the first report for a repeated Idempotency-Key', async () => {
    const author = await createUser('active');
    await loginAs(author);
    const questionId = await writeQuestion('Une question avec clé');
    const reporter = await createUser('active');
    await loginAs(reporter);
    const key = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b';

    const first = await postReport({ questionId, reason: 'spam' }, key).expect(201);
    const second = await postReport({ questionId, reason: 'spam' }, key).expect(201);

    expect(second.body.id).toBe(first.body.id);
    expect(await sql(`SELECT count(*) FROM reports WHERE reporter_id = '${reporter}';`)).toBe('1');
  });
});
