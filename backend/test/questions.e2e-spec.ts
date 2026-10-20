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

describe('Questions (e2e, B2)', () => {
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
         VALUES ('writer_${counter}', 'Writer ${counter}', 'writer-${counter}@example.test', 'hash', '${status}', now(), '1.0')
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

  function postQuestion(text: string) {
    return agent.post('/api/v1/questions').set('x-csrf-token', csrf!).send({ text });
  }

  function postWithKey(text: string, key: string) {
    return agent
      .post('/api/v1/questions')
      .set('x-csrf-token', csrf!)
      .set('Idempotency-Key', key)
      .send({ text });
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

  it('accepts a question of 280 characters (201) and returns it with zero counters and 0/50 Y', async () => {
    const author = await createUser('active');
    await loginAs(author);

    const response = await postQuestion('a'.repeat(280)).expect(201);

    expect(response.body).toMatchObject({
      text: 'a'.repeat(280),
      author: { handle: `writer_${counter}`, displayName: `Writer ${counter}` },
      hashtags: [],
      counters: { like: 0, dislike: 0, y: 0, reply: 0 },
      yThreshold: 50,
      conversationOpen: false,
    });
    expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(response.body.createdAt).toISOString()).toBe(response.body.createdAt);
    expect(response.headers.location).toBe(`/api/v1/questions/${response.body.id}`);
    expect(await sql(`SELECT count(*) FROM questions WHERE author_id = '${author}';`)).toBe('1');
  });

  it('refuses a question of 281 characters (422) and stores nothing', async () => {
    const author = await createUser('active');
    await loginAs(author);

    const response = await postQuestion('a'.repeat(281)).expect(422);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ status: 422 });
    expect(await sql(`SELECT count(*) FROM questions WHERE author_id = '${author}';`)).toBe('0');
  });

  it('refuses an empty text, and a text of spaces only (422)', async () => {
    const author = await createUser('active');
    await loginAs(author);

    await postQuestion('').expect(422);
    await postQuestion('   ').expect(422);
    expect(await sql(`SELECT count(*) FROM questions WHERE author_id = '${author}';`)).toBe('0');
  });

  it('counts the 280 characters after trimming the spaces around the text', async () => {
    const author = await createUser('active');
    await loginAs(author);

    const response = await postQuestion(`   ${'b'.repeat(280)}   `).expect(201);

    expect(response.body.text).toBe('b'.repeat(280));
  });

  it('stores the hashtags of the text, once per name, and reuses existing hashtags', async () => {
    const author = await createUser('active');
    await loginAs(author);

    const first = await postQuestion('Sujet #Online_Life, #irl_vs_online et #online_life').expect(201);
    const second = await postQuestion('Encore #online_life').expect(201);

    expect(first.body.hashtags).toEqual(['irl_vs_online', 'online_life']);
    expect(second.body.hashtags).toEqual(['online_life']);
    const linked = await sql(
      `SELECT h.name FROM question_hashtags qh JOIN hashtags h ON h.id = qh.hashtag_id
       WHERE qh.question_id = '${first.body.id}' ORDER BY h.name;`,
    );
    expect(linked).toBe('irl_vs_online\nonline_life');
    expect(await sql(`SELECT count(*) FROM hashtags WHERE name = 'online_life';`)).toBe('1');
  });

  it('returns the first question when the same key comes again with the same text', async () => {
    const author = await createUser('active');
    await loginAs(author);

    const first = await postWithKey('Clé rejouée #replay', 'key-replay').expect(201);
    const second = await postWithKey('Clé rejouée #replay', 'key-replay').expect(201);

    expect(second.body).toEqual(first.body);
    expect(await sql(`SELECT count(*) FROM questions WHERE author_id = '${author}';`)).toBe('1');
  });

  it('refuses the same key with another text (422) and stores nothing more', async () => {
    const author = await createUser('active');
    await loginAs(author);

    await postWithKey('Premier texte', 'key-other-text').expect(201);
    const refused = await postWithKey('Autre texte', 'key-other-text').expect(422);

    expect(refused.body.detail).toBe('Cette clé a déjà été utilisée pour une autre requête.');
    expect(await sql(`SELECT count(*) FROM questions WHERE author_id = '${author}';`)).toBe('1');
  });

  it('stores a key for 24 hours, and a key still within 24 hours replays the first question', async () => {
    const author = await createUser('active');
    await loginAs(author);

    const first = await postWithKey('Clé de 24 heures', 'key-lifetime').expect(201);
    const again = await postWithKey('Clé de 24 heures', 'key-lifetime').expect(201);

    expect(again.body.id).toBe(first.body.id);
    expect(
      await sql(
        `SELECT abs(extract(epoch FROM (expires_at - created_at)) - 86400) < 60 FROM idempotency_keys
         WHERE user_id = '${author}' AND key = 'key-lifetime';`,
      ),
    ).toBe('t');
  });

  it('reuses a key older than 24 hours: the request creates a new question', async () => {
    const author = await createUser('active');
    await loginAs(author);

    const first = await postWithKey('Clé expirée', 'key-expired').expect(201);
    await sql(
      `UPDATE idempotency_keys SET expires_at = now() - interval '1 second'
       WHERE user_id = '${author}' AND key = 'key-expired';`,
    );
    const reused = await postWithKey('Clé expirée', 'key-expired').expect(201);

    expect(reused.body.id).not.toBe(first.body.id);
    expect(await sql(`SELECT count(*) FROM questions WHERE author_id = '${author}';`)).toBe('2');
    expect(
      await sql(
        `SELECT count(*) FROM idempotency_keys WHERE user_id = '${author}' AND key = 'key-expired' AND expires_at > now();`,
      ),
    ).toBe('1');
  });

  it('keeps keys per user: the same key from another account creates its own question', async () => {
    const first = await createUser('active');
    const second = await createUser('active');

    await loginAs(first);
    const one = await postWithKey('Même clé', 'key-shared').expect(201);
    await loginAs(second);
    const two = await postWithKey('Même clé', 'key-shared').expect(201);

    expect(two.body.id).not.toBe(one.body.id);
    expect(two.body.author.handle).not.toBe(one.body.author.handle);
  });

  it('creates one question for parallel requests with the same key', async () => {
    const author = await createUser('active');
    await loginAs(author);

    const responses = await Promise.all([
      postWithKey('Envoi simultané', 'key-parallel'),
      postWithKey('Envoi simultané', 'key-parallel'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[1].body.id).toBe(responses[0].body.id);
    expect(await sql(`SELECT count(*) FROM questions WHERE author_id = '${author}';`)).toBe('1');
  });

  it('refuses an empty Idempotency-Key (400) and stores nothing', async () => {
    const author = await createUser('active');
    await loginAs(author);

    await postWithKey('Clé vide', '').expect(400);
    expect(await sql(`SELECT count(*) FROM questions WHERE author_id = '${author}';`)).toBe('0');
  });

  it('refuses a request without a session (401) and stores nothing', async () => {
    const token = await csrfToken();

    // A client with no session cookie: only the CSRF cookie and header are sent.
    const response = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Cookie', `y_csrf=${token}`)
      .set('x-csrf-token', token)
      .send({ text: 'Anonyme' })
      .expect(401);

    expect(response.body.status).toBe(401);
    expect(await sql(`SELECT count(*) FROM questions WHERE body = 'Anonyme';`)).toBe('0');
  });

  it('refuses a suspended account (403) and stores nothing', async () => {
    const suspended = await createUser('suspended');
    await loginAs(suspended);

    const response = await postQuestion('Compte suspendu').expect(403);

    expect(response.body.detail).toBe('Votre compte est suspendu.');
    expect(response.body.code).toBe('account_suspended');
    expect(await sql(`SELECT count(*) FROM questions WHERE author_id = '${suspended}';`)).toBe('0');
  });
});
