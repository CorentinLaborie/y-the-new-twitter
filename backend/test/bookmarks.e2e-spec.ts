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
  readonly agent: ReturnType<typeof request.agent>;
  readonly token: string;
}

describe('Bookmarks (e2e, L4)', () => {
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
        `INSERT INTO users (handle, display_name, email, password_hash, status, terms_accepted_at, terms_version)
         VALUES ('bk_${counter}', 'Bk ${counter}', 'bk-${counter}@example.test', 'hash', '${status}', now(), '1.0')
         RETURNING id || '|' || handle;`,
      )
    ).split('\n');
    const [id, handle] = row.split('|');
    return { id, handle };
  }

  /** A question by the account. Returns its id (the first line: psql also prints the INSERT tag). */
  async function createQuestion(authorId: string): Promise<string> {
    const output = await sql(
      `INSERT INTO questions (author_id, body) VALUES ('${authorId}', 'Question de test') RETURNING id;`,
    );
    return output.split('\n')[0];
  }

  /** A saved row, with the save time given (the list is ordered by it). */
  function insertBookmark(userId: string, questionId: string, savedAt: string): Promise<string> {
    return sql(
      `INSERT INTO bookmarks (user_id, question_id, created_at) VALUES ('${userId}', '${questionId}', '${savedAt}');`,
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
    return { agent, token };
  }

  function save(client: Client, questionId: string) {
    return client.agent.put(`/api/v1/questions/${questionId}/bookmark`).set('x-csrf-token', client.token);
  }

  function unsave(client: Client, questionId: string) {
    return client.agent.delete(`/api/v1/questions/${questionId}/bookmark`).set('x-csrf-token', client.token);
  }

  function bookmarkRows(userId: string, questionId: string): Promise<string> {
    return sql(
      `SELECT count(*) FROM bookmarks WHERE user_id = '${userId}' AND question_id = '${questionId}';`,
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

  it('saves a visible question (200 with the state), and the list shows it as saved', async () => {
    const viewer = await createAccount();
    const author = await createAccount();
    const questionId = await createQuestion(author.id);
    const client = await clientFor(viewer.id);

    const response = await save(client, questionId).expect(200);

    expect(response.body).toEqual({ questionId, saved: true });
    expect(await bookmarkRows(viewer.id, questionId)).toBe('1');
    const list = await client.agent.get('/api/v1/bookmarks').expect(200);
    expect(list.body.questions).toEqual([expect.objectContaining({ id: questionId, viewerSaved: true })]);
    expect(list.body.nextCursor).toBeNull();
  });

  it('is idempotent: saving again keeps one row', async () => {
    const viewer = await createAccount();
    const questionId = await createQuestion((await createAccount()).id);
    const client = await clientFor(viewer.id);

    await save(client, questionId).expect(200);
    await save(client, questionId).expect(200);

    expect(await bookmarkRows(viewer.id, questionId)).toBe('1');
  });

  it('answers 404 when the question is deleted, and stores nothing', async () => {
    const viewer = await createAccount();
    const questionId = await createQuestion((await createAccount()).id);
    await sql(`UPDATE questions SET deleted_at = now() WHERE id = '${questionId}';`);
    const client = await clientFor(viewer.id);

    await save(client, questionId).expect(404);

    expect(await bookmarkRows(viewer.id, questionId)).toBe('0');
  });

  it('answers 404 when the author is suspended, and the saved question leaves the list', async () => {
    const viewer = await createAccount();
    const author = await createAccount();
    const questionId = await createQuestion(author.id);
    const client = await clientFor(viewer.id);
    await save(client, questionId).expect(200);

    await sql(`UPDATE users SET status = 'suspended' WHERE id = '${author.id}';`);

    const list = await client.agent.get('/api/v1/bookmarks').expect(200);
    expect(list.body.questions).toEqual([]);
    await save(client, questionId).expect(404);
  });

  it('removes the save (204), and repeating the removal changes nothing', async () => {
    const viewer = await createAccount();
    const questionId = await createQuestion((await createAccount()).id);
    const client = await clientFor(viewer.id);
    await save(client, questionId).expect(200);

    await unsave(client, questionId).expect(204);
    await unsave(client, questionId).expect(204);

    expect(await bookmarkRows(viewer.id, questionId)).toBe('0');
  });

  it('lists the newest saves first, in pages with a cursor, without duplicates or gaps', async () => {
    const viewer = await createAccount();
    const author = await createAccount();
    const first = await createQuestion(author.id);
    const second = await createQuestion(author.id);
    const third = await createQuestion(author.id);
    await insertBookmark(viewer.id, first, '2026-10-20T10:00:00.000Z');
    await insertBookmark(viewer.id, second, '2026-10-22T10:00:00.000Z');
    await insertBookmark(viewer.id, third, '2026-10-21T10:00:00.000Z');
    const client = await clientFor(viewer.id);

    const page1 = await client.agent.get('/api/v1/bookmarks?limit=2').expect(200);
    const page2 = await client.agent
      .get(`/api/v1/bookmarks?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
      .expect(200);

    expect(page1.body.questions.map((question: { id: string }) => question.id)).toEqual([second, third]);
    expect(page2.body.questions.map((question: { id: string }) => question.id)).toEqual([first]);
    expect(page2.body.nextCursor).toBeNull();
  });

  it('searches the saved questions by text or author name, without case, and gives the total of every save', async () => {
    const viewer = await createAccount();
    const alice = await createAccount();
    const bob = await createAccount();
    const bread = await createQuestion(alice.id);
    const bike = await createQuestion(bob.id);
    const both = await createQuestion(alice.id);
    await sql(`UPDATE questions SET body = 'Recette du pain' WHERE id = '${bread}';`);
    await sql(`UPDATE questions SET body = 'Le vélo en ville' WHERE id = '${bike}';`);
    await sql(`UPDATE questions SET body = 'Le vélo et le pain' WHERE id = '${both}';`);
    await insertBookmark(viewer.id, bread, '2026-10-20T10:00:00.000Z');
    await insertBookmark(viewer.id, bike, '2026-10-21T10:00:00.000Z');
    await insertBookmark(viewer.id, both, '2026-10-22T10:00:00.000Z');
    const client = await clientFor(viewer.id);
    const ids = (body: { questions: { id: string }[] }) => body.questions.map((question) => question.id);

    const byText = await client.agent.get('/api/v1/bookmarks?q=VÉLO').expect(200);
    expect(ids(byText.body)).toEqual([both, bike]);
    expect(byText.body.total).toBe(3);

    const byAuthor = await client.agent
      .get(`/api/v1/bookmarks?q=${encodeURIComponent(alice.handle.toUpperCase())}`)
      .expect(200);
    expect(ids(byAuthor.body)).toEqual([both, bread]);

    const blank = await client.agent.get('/api/v1/bookmarks?q=%20%20').expect(200);
    expect(ids(blank.body)).toEqual([both, bike, bread]);

    await client.agent.get(`/api/v1/bookmarks?q=${'x'.repeat(101)}`).expect(400);
  });

  it('refuses a question id that is not a UUID (400), and a missing CSRF token (403)', async () => {
    const viewer = await createAccount();
    const client = await clientFor(viewer.id);

    await client.agent
      .put('/api/v1/questions/not-a-uuid/bookmark')
      .set('x-csrf-token', client.token)
      .expect(400);
    await client.agent
      .put(`/api/v1/questions/${await createQuestion((await createAccount()).id)}/bookmark`)
      .expect(403);
  });

  it('refuses a suspended viewer (403) on save and on the list', async () => {
    const viewer = await createAccount();
    const questionId = await createQuestion((await createAccount()).id);
    const client = await clientFor(viewer.id);
    await sql(`UPDATE users SET status = 'suspended' WHERE id = '${viewer.id}';`);

    await save(client, questionId).expect(403);
    await client.agent.get('/api/v1/bookmarks').expect(403);
  });
});
