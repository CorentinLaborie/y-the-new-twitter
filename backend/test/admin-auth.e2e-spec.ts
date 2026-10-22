import { INestApplication } from '@nestjs/common';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { ADMIN_IDLE_TIMEOUT_MS, ADMIN_MAX_SESSION_MS } from '../src/admin/admin-session';
import { CapturingMailSender } from '../src/common/mail/capturing-mail-sender';
import { MAIL_SENDER } from '../src/common/mail/mail-sender';
import { hashPassword } from '../src/auth/password';
import { PrismaService } from '../src/database/prisma.service';
import type { Prisma } from '../src/database/generated/client/client';
import { UsersRepository } from '../src/users/users.repository';
import { startApp } from './support/app';
import { resetRateLimits } from './support/rate-limits';
import { sqlAsSuperuser, startMigratedPostgres } from './support/postgres';

const PASSWORD = 'Abcdef1!';
const WRONG_PASSWORD = 'Abcdef1?';
const BASE = '/api/v1';

describe('Back-office sign-in with the password (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersRepository;
  let mail: CapturingMailSender;

  /** A visitor with its own cookie jar and CSRF token, so each test starts with no session. */
  async function newVisitor() {
    const agent = request.agent(app.getHttpServer());
    const status = await agent.get(`${BASE}/status`).expect(200);
    return { agent, csrf: cookieValue(status, 'y_csrf') ?? '' };
  }

  async function createAccount(handle: string, role: 'user' | 'admin'): Promise<{ id: string; email: string }> {
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
    await prisma.user.update({ where: { id: user.id }, data: { status: 'active', role } });
    return { id: user.id, email: user.email };
  }

  function cookieValue(response: request.Response, name: string): string | undefined {
    const cookies = (response.headers['set-cookie'] ?? []) as unknown as string[];
    return cookies
      .find((value) => value.startsWith(`${name}=`))
      ?.split(';')[0]
      .split('=')[1];
  }

  function adminLogin(
    visitor: { agent: ReturnType<typeof request.agent>; csrf: string },
    body: Record<string, string>,
  ) {
    return visitor.agent.post(`${BASE}/admin/login`).set('x-csrf-token', visitor.csrf).send(body);
  }

  const sql = (statement: string) => sqlAsSuperuser(container, statement);

  /** The session ID in the SESSION cookie: the signed cookie is `s:<id>.<signature>`. */
  function sessionIdOf(response: request.Response): string {
    const raw = decodeURIComponent(cookieValue(response, 'SESSION') ?? '');
    return raw.slice(2, raw.lastIndexOf('.'));
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    // The configuration is read when AppModule is loaded, so the database URL is set before the import.
    process.env.DATABASE_URL = container.getConnectionUri();
    app = await startApp();
    prisma = app.get(PrismaService);
    users = app.get(UsersRepository);
    mail = app.get<CapturingMailSender>(MAIL_SENDER);
  }, 180_000);

  beforeEach(async () => {
    // The rate limits are per IP, and every request of this file comes from one address: each test starts empty.
    await resetRateLimits(app);
    mail.clear();
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('answers 404 to an anonymous visitor on the back-office, as if the route did not exist (DEC-037)', async () => {
    const visitor = await newVisitor();

    await visitor.agent.get(`${BASE}/admin/session`).expect(404);
  });

  it('answers 404 to a signed-in user who is not an administrator', async () => {
    await createAccount('plain_user', 'user');
    const visitor = await newVisitor();
    await visitor.agent
      .post(`${BASE}/auth/login`)
      .set('x-csrf-token', visitor.csrf)
      .send({ email: 'plain_user@example.test', password: PASSWORD })
      .expect(200);

    await visitor.agent.get(`${BASE}/admin/session`).expect(404);
  });

  it('answers the same 401 to a wrong password and to a correct password of a user who is not an administrator', async () => {
    await createAccount('wrong_pass_admin', 'admin');
    await createAccount('not_an_admin', 'user');

    const wrong = await adminLogin(await newVisitor(), {
      email: 'wrong_pass_admin@example.test',
      password: WRONG_PASSWORD,
    }).expect(401);
    const notAdmin = await adminLogin(await newVisitor(), {
      email: 'not_an_admin@example.test',
      password: PASSWORD,
    }).expect(401);

    expect(notAdmin.body.detail).toBe('Identifiants incorrects');
    expect(notAdmin.body.detail).toBe(wrong.body.detail);
  });

  it('signs an administrator in with the email and the password only, and opens the back-office session', async () => {
    await createAccount('first_admin', 'admin');
    const visitor = await newVisitor();

    await adminLogin(visitor, { email: 'first_admin@example.test', password: PASSWORD }).expect(200, {
      status: 'ok',
      user: { handle: 'first_admin', displayName: 'Compte first_admin' },
    });

    const session = await visitor.agent.get(`${BASE}/admin/session`).expect(200);
    expect(session.body.user).toEqual({ handle: 'first_admin', displayName: 'Compte first_admin' });
    expect(Date.parse(session.body.expiresAt) - Date.now()).toBeLessThanOrEqual(ADMIN_MAX_SESSION_MS);
    expect(Date.parse(session.body.idleExpiresAt) - Date.now()).toBeLessThanOrEqual(ADMIN_IDLE_TIMEOUT_MS);
  });

  it('has no second-factor route any more', async () => {
    const visitor = await newVisitor();

    await visitor.agent
      .post(`${BASE}/admin/mfa/setup`)
      .set('x-csrf-token', visitor.csrf)
      .send({ token: 'anything' })
      .expect(404);
    await visitor.agent
      .post(`${BASE}/admin/mfa/confirm`)
      .set('x-csrf-token', visitor.csrf)
      .send({ code: '123456' })
      .expect(404);
  });

  it('sends no e-mail on a sign-in, and writes each sign-in in the audit log', async () => {
    const account = await createAccount('audit_admin', 'admin');

    await adminLogin(await newVisitor(), { email: account.email, password: PASSWORD }).expect(200);
    await adminLogin(await newVisitor(), { email: account.email, password: PASSWORD }).expect(200);

    expect(mail.messages()).toHaveLength(0);
    expect(
      await sql(
        `SELECT count(*) FROM admin_audit_log WHERE actor_id = '${account.id}' AND action = 'auth.admin_login' AND result = 'ok';`,
      ),
    ).toBe('2');
  });
  it('locks the account after five wrong passwords, and refuses even the right password meanwhile', async () => {
    const account = await createAccount('lock_admin', 'admin');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await adminLogin(await newVisitor(), { email: account.email, password: WRONG_PASSWORD }).expect(401);
    }

    const locked = await adminLogin(await newVisitor(), { email: account.email, password: PASSWORD }).expect(401);
    expect(locked.body.detail).toBe('Identifiants incorrects');
    expect(await sql(`SELECT count(*) FROM users WHERE id = '${account.id}' AND locked_until > now();`)).toBe('1');
  });

  it('ends the back-office session after 30 minutes without a request', async () => {
    const account = await createAccount('idle_admin', 'admin');
    const visitor = await newVisitor();
    const login = await adminLogin(visitor, { email: account.email, password: PASSWORD }).expect(200);

    const row = await prisma.session.findUniqueOrThrow({ where: { id: sessionIdOf(login) } });
    const data = row.data as unknown as { admin: { verifiedAt: string; lastSeenAt: string } };
    data.admin.lastSeenAt = new Date(Date.now() - ADMIN_IDLE_TIMEOUT_MS - 60_000).toISOString();
    await prisma.session.update({
      where: { id: row.id },
      data: { data: data as unknown as Prisma.InputJsonObject },
    });

    await visitor.agent.get(`${BASE}/admin/session`).expect(401);
  });

  it('ends the back-office session 8 hours after the sign-in, even while it is used', async () => {
    const account = await createAccount('long_admin', 'admin');
    const visitor = await newVisitor();
    const login = await adminLogin(visitor, { email: account.email, password: PASSWORD }).expect(200);

    const row = await prisma.session.findUniqueOrThrow({ where: { id: sessionIdOf(login) } });
    const data = row.data as unknown as { admin: { verifiedAt: string; lastSeenAt: string } };
    data.admin.verifiedAt = new Date(Date.now() - ADMIN_MAX_SESSION_MS - 60_000).toISOString();
    await prisma.session.update({
      where: { id: row.id },
      data: { data: data as unknown as Prisma.InputJsonObject },
    });

    await visitor.agent.get(`${BASE}/admin/session`).expect(401);
  });
});
