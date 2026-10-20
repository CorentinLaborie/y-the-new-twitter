import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { hashPassword } from '../src/auth/password';
import { PrismaService } from '../src/database/prisma.service';
import { UsersRepository } from '../src/users/users.repository';
import { resetRateLimits } from './support/rate-limits';
import { runAsSuperuser, startMigratedPostgres } from './support/postgres';

const PASSWORD = 'Abcdef1!';
const WRONG_PASSWORD = 'Abcdef1?';
const LOGIN = '/api/v1/auth/login';

describe('Login, session and logout (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersRepository;
  let agent: ReturnType<typeof request.agent>;
  let csrf: string;

  async function startApp(): Promise<INestApplication> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const created = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(created);
    await created.init();
    return created;
  }

  /** Creates an account through the repository, then sets its status with Prisma, as the tests need. */
  async function createAccount(handle: string, active: boolean): Promise<string> {
    const user = await users.create({
      handle,
      displayName: `Compte ${handle}`,
      email: `${handle}@example.test`,
      passwordHash: await hashPassword(PASSWORD),
      birthDate: new Date('1990-01-01'),
      phone: null,
      termsAcceptedAt: new Date(),
      termsVersion: '1.0',
    });
    if (active) {
      await prisma.user.update({ where: { id: user.id }, data: { status: 'active' } });
    }
    return user.id;
  }

  function login(email: string, password: string) {
    return agent.post(LOGIN).set('x-csrf-token', csrf).send({ email, password });
  }

  function cookieValue(response: request.Response, name: string): string | undefined {
    const cookies = (response.headers['set-cookie'] ?? []) as unknown as string[];
    return cookies
      .find((value) => value.startsWith(`${name}=`))
      ?.split(';')[0]
      .split('=')[1];
  }

  /** The session ID stored in the sessions table: the signed cookie is `s:<id>.<signature>`. */
  function sessionIdOf(response: request.Response): string {
    const raw = decodeURIComponent(cookieValue(response, 'SESSION') ?? '');
    return raw.slice(2, raw.lastIndexOf('.'));
  }

  async function sql(statement: string): Promise<string> {
    return (await runAsSuperuser(container, statement)).stdout.trim();
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    // The configuration is read when AppModule is loaded, so the database URL is set before the import.
    process.env.DATABASE_URL = container.getConnectionUri();
    app = await startApp();
    prisma = app.get(PrismaService);
    users = app.get(UsersRepository);
    agent = request.agent(app.getHttpServer());

    // The CSRF cookie is set by the first safe request, and its value is sent back on every mutation.
    const status = await agent.get('/api/v1/status').expect(200);
    csrf = cookieValue(status, 'y_csrf') ?? '';
  }, 180_000);

  beforeEach(async () => {
    // The rate limits are per IP, and every request of this file comes from one address: each test starts empty.
    await resetRateLimits(app);
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('answers 401 with the generic message for an unknown address, and records the failure without a user', async () => {
    const response = await login('nobody@example.test', PASSWORD).expect(401);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.detail).toBe('Identifiants incorrects');
    expect(await sql(`SELECT count(*) FROM login_events WHERE user_id IS NULL AND result = 'failure';`)).toBe(
      '1',
    );
  });

  it('answers the same 401 for a wrong password, and counts one failure on the account', async () => {
    const id = await createAccount('login_counted', true);

    const response = await login('login_counted@example.test', WRONG_PASSWORD).expect(401);

    expect(response.body.detail).toBe('Identifiants incorrects');
    expect(await sql(`SELECT failed_login_count FROM users WHERE id = '${id}';`)).toBe('1');
  });

  it('answers 403 for a pending account even with the right password, and opens no session', async () => {
    const id = await createAccount('login_pending', false);

    const response = await login('login_pending@example.test', PASSWORD).expect(403);

    expect(cookieValue(response, 'SESSION')).toBeUndefined();
    expect(await sql(`SELECT count(*) FROM sessions WHERE user_id = '${id}';`)).toBe('0');
  });

  it('logs an active account in: 200 with the user, a HTTP-only SESSION cookie, and the counter reset', async () => {
    const id = await createAccount('login_active', true);
    await login('login_active@example.test', WRONG_PASSWORD).expect(401);

    const response = await login('login_active@example.test', PASSWORD).expect(200);

    expect(response.body).toEqual({ user: { handle: 'login_active', displayName: 'Compte login_active' } });
    const cookie = (response.headers['set-cookie'] as unknown as string[]).find((value) =>
      value.startsWith('SESSION='),
    );
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(await sql(`SELECT count(*) FROM sessions WHERE user_id = '${id}';`)).toBe('1');
    expect(await sql(`SELECT failed_login_count FROM users WHERE id = '${id}';`)).toBe('0');
  });

  it('gives a new session ID at each login, and the previous session row is gone', async () => {
    const id = await createAccount('login_regenerated', true);
    const first = await login('login_regenerated@example.test', PASSWORD).expect(200);
    const before = sessionIdOf(first);

    const second = await login('login_regenerated@example.test', PASSWORD).expect(200);

    expect(sessionIdOf(second)).not.toBe(before);
    expect(await sql(`SELECT count(*) FROM sessions WHERE id = '${before}';`)).toBe('0');
    expect(await sql(`SELECT count(*) FROM sessions WHERE user_id = '${id}';`)).toBe('1');
  });

  it('GET /auth/session returns the user while logged in, and null without a session', async () => {
    await login('login_active@example.test', PASSWORD).expect(200);

    const logged = await agent.get('/api/v1/auth/session').expect(200);
    const anonymous = await request(app.getHttpServer()).get('/api/v1/auth/session').expect(200);

    expect(logged.body).toEqual({
      user: {
        handle: 'login_active',
        displayName: 'Compte login_active',
        status: 'active',
        suspensionReason: null,
      },
    });
    expect(anonymous.body).toEqual({ user: null });
  });

  it('logout answers 204, deletes the session row, and the session is no longer read', async () => {
    const id = await createAccount('login_logout', true);
    await login('login_logout@example.test', PASSWORD).expect(200);

    await agent.post('/api/v1/auth/logout').set('x-csrf-token', csrf).expect(204);

    expect(await sql(`SELECT count(*) FROM sessions WHERE user_id = '${id}';`)).toBe('0');
    const response = await agent.get('/api/v1/auth/session').expect(200);
    expect(response.body).toEqual({ user: null });
  });

  it('answers the fifth failure 401 and locks: the next attempt is the same 401, even for the right password', async () => {
    const id = await createAccount('login_locked', true);

    for (let attempt = 1; attempt <= 5; attempt++) {
      await login('login_locked@example.test', WRONG_PASSWORD).expect(401);
    }
    const refused = await login('login_locked@example.test', PASSWORD).expect(401);

    expect(refused.headers['retry-after']).toBeUndefined();
    expect(refused.body.detail).toBe('Identifiants incorrects');
    expect(await sql(`SELECT count(*) FROM sessions WHERE user_id = '${id}';`)).toBe('0');
    expect(await sql(`SELECT locked_until > now() FROM users WHERE id = '${id}';`)).toBe('t');
  });

  it('accepts the right password again once the lock has expired, and resets the counter', async () => {
    const id = await createAccount('login_expired', true);
    for (let attempt = 0; attempt < 5; attempt++) {
      await login('login_expired@example.test', WRONG_PASSWORD);
    }
    await runAsSuperuser(
      container,
      `UPDATE users SET locked_until = now() - interval '1 minute' WHERE id = '${id}';`,
    );

    await login('login_expired@example.test', PASSWORD).expect(200);

    expect(await sql(`SELECT failed_login_count FROM users WHERE id = '${id}';`)).toBe('0');
  });

  it('writes every attempt to login_events with a hashed IP and a user agent of at most 255 characters', async () => {
    const id = await createAccount('login_events', true);

    await agent
      .post(LOGIN)
      .set('x-csrf-token', csrf)
      .set('user-agent', 'u'.repeat(300))
      .send({ email: 'login_events@example.test', password: WRONG_PASSWORD })
      .expect(401);
    await login('login_events@example.test', PASSWORD).expect(200);

    const rows = (
      await sql(
        `SELECT result || '|' || length(ip_hash) || '|' || coalesce(length(user_agent)::text, 'null')
           FROM login_events WHERE user_id = '${id}' ORDER BY created_at;`,
      )
    ).split('\n');
    expect(rows[0]).toBe('failure|64|255');
    expect(rows[1]).toMatch(/^success\|64\|/);
  });
});
