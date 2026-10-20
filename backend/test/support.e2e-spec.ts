import { Controller, INestApplication, Param, Post, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Request } from 'express';
import request from 'supertest';
import { Public } from '../src/auth/session/access.decorators';
import { hashPassword } from '../src/auth/password';
import { configureApp } from '../src/configure-app';
import { runAsSuperuser, startMigratedPostgres } from './support/postgres';

const PASSWORD = 'Abcdef1!';
const CONTACT_PATH = '/api/v1/support/messages';
const REFERENCE_PATTERN = /^CNT-\d{8}-\d{4}$/;

/** Test-only route that starts a session for a user, through the real session middleware. */
@Controller('session-probe')
class SessionProbeController {
  @Public()
  @Post('login/:userId')
  login(@Req() req: Request, @Param('userId') userId: string): void {
    req.session.userId = userId;
  }
}

/** Reads one value with psql, as the test container's superuser. */
async function scalar(container: StartedPostgreSqlContainer, statement: string): Promise<string> {
  const result = await runAsSuperuser(container, statement);
  return result.output.trim();
}

describe('POST /support/messages: contact messages of suspended accounts (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let hash: string;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    process.env.DATABASE_URL = container.getConnectionUri();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [SessionProbeController],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
    hash = await hashPassword(PASSWORD);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  /** Creates an account with a given status and returns its id. */
  async function insertAccount(handle: string, status: string): Promise<string> {
    const result = await runAsSuperuser(
      container,
      `INSERT INTO users (handle, display_name, email, password_hash, terms_accepted_at, terms_version, role, status)
       VALUES ('${handle}', '${handle}', '${handle}@example.test', '${hash}', now(), '1.0', 'user', '${status}')
       RETURNING id;`,
    );

    // psql also prints the command tag ("INSERT 0 1") after the returned row, so keep the first line.
    return result.stdout.split('\n')[0].trim();
  }

  /** Creates an account with a given status, logs it in, and returns an agent that keeps its cookies. */
  async function loggedInAs(handle: string, status: string) {
    await insertAccount(handle, status);
    const agent = request.agent(app.getHttpServer());
    const status200 = await agent.get('/api/v1/status');
    const csrf = (status200.headers['set-cookie'] as unknown as string[])
      .find((cookie) => cookie.startsWith('y_csrf='))!
      .split(';')[0]
      .split('=')[1];
    await agent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: `${handle}@example.test`, password: PASSWORD })
      .expect(200);

    return { agent, csrf };
  }

  /** Opens a session for an account without the login route, which refuses a pending account (403). */
  async function sessionWithoutLogin(userId: string) {
    const agent = request.agent(app.getHttpServer());
    const status200 = await agent.get('/api/v1/status');
    const csrf = (status200.headers['set-cookie'] as unknown as string[])
      .find((cookie) => cookie.startsWith('y_csrf='))!
      .split(';')[0]
      .split('=')[1];
    await agent.post(`/api/v1/session-probe/login/${userId}`).set('x-csrf-token', csrf).expect(201);

    return { agent, csrf };
  }

  it('answers 401 to an anonymous visitor', async () => {
    const agent = request.agent(app.getHttpServer());
    const status200 = await agent.get('/api/v1/status');
    const csrf = (status200.headers['set-cookie'] as unknown as string[])
      .find((cookie) => cookie.startsWith('y_csrf='))!
      .split(';')[0]
      .split('=')[1];

    await agent.post(CONTACT_PATH).set('x-csrf-token', csrf).send({ text: 'Bonjour' }).expect(401);
  });

  it('refuses an active account with 403, and writes no thread', async () => {
    const { agent, csrf } = await loggedInAs('support_active', 'active');

    await agent.post(CONTACT_PATH).set('x-csrf-token', csrf).send({ text: 'Bonjour' }).expect(403);

    expect(
      await scalar(
        container,
        `SELECT count(*) FROM support_threads WHERE user_id = (SELECT id FROM users WHERE handle = 'support_active');`,
      ),
    ).toBe('0');
  });

  it('refuses a pending verification account with its own 403 code', async () => {
    const userId = await insertAccount('support_pending', 'pending_verification');
    const { agent, csrf } = await sessionWithoutLogin(userId);

    const response = await agent
      .post(CONTACT_PATH)
      .set('x-csrf-token', csrf)
      .send({ text: 'Bonjour' })
      .expect(403);

    expect(response.body.code).toBe('account_pending_verification');
  });

  it('opens a thread with a CNT reference for a suspended account, and reuses it for the next message', async () => {
    const { agent, csrf } = await loggedInAs('support_suspended', 'suspended');

    const first = await agent
      .post(CONTACT_PATH)
      .set('x-csrf-token', csrf)
      .send({ text: '  Je conteste la suspension.  ' })
      .expect(201);
    const second = await agent
      .post(CONTACT_PATH)
      .set('x-csrf-token', csrf)
      .send({ text: 'Un complément.' })
      .expect(201);

    expect(first.body.reference).toMatch(REFERENCE_PATTERN);
    expect(second.body.reference).toBe(first.body.reference);
    expect(
      await scalar(
        container,
        `SELECT count(*) FROM support_threads WHERE user_id = (SELECT id FROM users WHERE handle = 'support_suspended');`,
      ),
    ).toBe('1');
    expect(
      await scalar(
        container,
        `SELECT string_agg(m.body, '|' ORDER BY m.sent_at) FROM support_messages m
         JOIN support_threads t ON t.id = m.thread_id WHERE t.reference = '${first.body.reference}';`,
      ),
    ).toBe('Je conteste la suspension.|Un complément.');
  });

  it('puts a replied thread back to new when the user writes again (DEC-116, case 1)', async () => {
    const { agent, csrf } = await loggedInAs('support_replied', 'suspended');
    const first = await agent
      .post(CONTACT_PATH)
      .set('x-csrf-token', csrf)
      .send({ text: 'Premier message.' })
      .expect(201);
    await runAsSuperuser(
      container,
      `UPDATE support_threads SET status = 'replied', open_user_id = NULL
       WHERE reference = '${first.body.reference}';`,
    );

    const again = await agent
      .post(CONTACT_PATH)
      .set('x-csrf-token', csrf)
      .send({ text: 'Une précision.' })
      .expect(201);

    expect(again.body.reference).toBe(first.body.reference);
    expect(
      await scalar(
        container,
        `SELECT status || '|' || (open_user_id IS NOT NULL)::text FROM support_threads
         WHERE reference = '${first.body.reference}';`,
      ),
    ).toBe('new|true');
  });

  it('opens a new thread, with a new reference, when the open thread is closed (DEC-116, case 2)', async () => {
    const { agent, csrf } = await loggedInAs('support_closed', 'suspended');
    const first = await agent
      .post(CONTACT_PATH)
      .set('x-csrf-token', csrf)
      .send({ text: 'Premier message.' })
      .expect(201);
    await runAsSuperuser(
      container,
      `UPDATE support_threads SET status = 'closed', open_user_id = NULL, closed_at = now()
       WHERE reference = '${first.body.reference}';`,
    );

    const next = await agent
      .post(CONTACT_PATH)
      .set('x-csrf-token', csrf)
      .send({ text: 'Nouveau sujet.' })
      .expect(201);

    expect(next.body.reference).toMatch(REFERENCE_PATTERN);
    expect(next.body.reference).not.toBe(first.body.reference);
  });

  it('refuses a text of 1001 characters with 422, and an empty text with 422', async () => {
    const { agent, csrf } = await loggedInAs('support_length', 'suspended');

    await agent
      .post(CONTACT_PATH)
      .set('x-csrf-token', csrf)
      .send({ text: 'a'.repeat(1001) })
      .expect(422);
    await agent.post(CONTACT_PATH).set('x-csrf-token', csrf).send({ text: '   ' }).expect(422);
  });

  it('accepts a text of exactly 1000 characters', async () => {
    const { agent, csrf } = await loggedInAs('support_max', 'suspended');

    await agent
      .post(CONTACT_PATH)
      .set('x-csrf-token', csrf)
      .send({ text: 'a'.repeat(1000) })
      .expect(201);
  });

  it('answers 400 when the body has no text field', async () => {
    const { agent, csrf } = await loggedInAs('support_nobody', 'suspended');

    await agent.post(CONTACT_PATH).set('x-csrf-token', csrf).send({}).expect(400);
  });
});
