import { INestApplication } from '@nestjs/common';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { ADMIN_IDLE_TIMEOUT_MS, ADMIN_MAX_SESSION_MS } from '../src/admin/admin-session';
import { CapturingMailSender } from '../src/common/mail/capturing-mail-sender';
import { MAIL_SENDER } from '../src/common/mail/mail-sender';
import { stepAt, totpCode } from '../src/admin/mfa/totp';
import { hashPassword } from '../src/auth/password';
import { PrismaService } from '../src/database/prisma.service';
import type { Prisma } from '../src/database/generated/client/client';
import { UsersRepository } from '../src/users/users.repository';
import { startApp } from './support/app';
import { resetRateLimits } from './support/rate-limits';
import { sqlAsSuperuser, startMigratedPostgres } from './support/postgres';
import { setupTokenSentTo } from './support/back-office';

const PASSWORD = 'Abcdef1!';
const WRONG_PASSWORD = 'Abcdef1?';
const WRONG_CODE = '000000';
const BASE = '/api/v1';

describe('Back-office sign-in and second factor (e2e)', () => {
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

  async function createAccount(
    handle: string,
    role: 'user' | 'admin',
  ): Promise<{ id: string; email: string }> {
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

  /** Signs an administrator through the set-up, and returns the TOTP secret and the backup codes. */
  async function enrolAdministrator(handle: string) {
    const account = await createAccount(handle, 'admin');
    const visitor = await newVisitor();
    await adminLogin(visitor, { email: account.email, password: PASSWORD }).expect(200, {
      status: 'setup_required',
    });

    const setup = await visitor.agent
      .post(`${BASE}/admin/mfa/setup`)
      .set('x-csrf-token', visitor.csrf)
      .send({ token: setupTokenSentTo(app, account.email) })
      .expect(200);
    const confirmed = await visitor.agent
      .post(`${BASE}/admin/mfa/confirm`)
      .set('x-csrf-token', visitor.csrf)
      .send({ code: totpCode(setup.body.secret, stepAt(Date.now())) })
      .expect(201);

    return {
      account,
      secret: setup.body.secret as string,
      backupCodes: confirmed.body.backupCodes as string[],
    };
  }

  /** The next time step: the set-up code already used the current one, and a step can be used once. */
  function nextCode(secret: string): string {
    return totpCode(secret, stepAt(Date.now()) + 1);
  }

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
      .send({
        email: 'plain_user@example.test',
        password: PASSWORD,
      })
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

  it('sends an administrator without a second factor a set-up link by e-mail, with no session, then signs in after the first code', async () => {
    const account = await createAccount('first_admin', 'admin');
    const visitor = await newVisitor();

    await adminLogin(visitor, { email: account.email, password: PASSWORD }).expect(200, {
      status: 'setup_required',
    });
    await visitor.agent.get(`${BASE}/admin/session`).expect(404);

    const setup = await visitor.agent
      .post(`${BASE}/admin/mfa/setup`)
      .set('x-csrf-token', visitor.csrf)
      .send({ token: setupTokenSentTo(app, account.email) })
      .expect(200);
    expect(setup.body.otpauthUri).toContain(`otpauth://totp/Y:first_admin?secret=${setup.body.secret}`);

    const confirmed = await visitor.agent
      .post(`${BASE}/admin/mfa/confirm`)
      .set('x-csrf-token', visitor.csrf)
      .send({ code: totpCode(setup.body.secret, stepAt(Date.now())) })
      .expect(201);

    expect(confirmed.body.backupCodes).toHaveLength(10);
    const session = await visitor.agent.get(`${BASE}/admin/session`).expect(200);
    expect(session.body.user).toEqual({ handle: 'first_admin', displayName: 'Compte first_admin' });
    expect(Date.parse(session.body.expiresAt) - Date.now()).toBeLessThanOrEqual(ADMIN_MAX_SESSION_MS);
    expect(Date.parse(session.body.idleExpiresAt) - Date.now()).toBeLessThanOrEqual(ADMIN_IDLE_TIMEOUT_MS);
  });

  it('refuses the set-up without a link from the mailbox, so a password alone cannot enrol a factor', async () => {
    const account = await createAccount('no_link_admin', 'admin');
    const visitor = await newVisitor();
    await adminLogin(visitor, { email: account.email, password: PASSWORD }).expect(200, {
      status: 'setup_required',
    });

    await visitor.agent
      .post(`${BASE}/admin/mfa/setup`)
      .set('x-csrf-token', visitor.csrf)
      .send({ token: 'invented.token' })
      .expect(401);
    await visitor.agent.get(`${BASE}/admin/session`).expect(404);
    expect(await sql(`SELECT count(*) FROM admin_mfa WHERE user_id = '${account.id}';`)).toBe('0');
  });

  it('stores the TOTP secret encrypted and the backup codes hashed, never in clear', async () => {
    const { account, secret, backupCodes } = await enrolAdministrator('stored_admin');

    expect(await sql(`SELECT count(*) FROM admin_mfa WHERE user_id = '${account.id}';`)).toBe('1');
    expect(await sql(`SELECT count(*) FROM admin_mfa WHERE totp_secret_encrypted LIKE '%${secret}%';`)).toBe(
      '0',
    );
    expect(await sql(`SELECT count(*) FROM admin_backup_codes WHERE user_id = '${account.id}';`)).toBe('10');
    expect(await sql(`SELECT count(*) FROM admin_backup_codes WHERE code_hash = '${backupCodes[0]}';`)).toBe(
      '0',
    );
  });

  it('sends the e-mail alert on the set-up confirmation and on every later sign-in', async () => {
    const { account, secret } = await enrolAdministrator('alert_admin');
    const alerts = () => mail.messages().filter((message) => message.subject === 'Connexion à l’administration Y');
    expect(alerts().map((message) => message.to)).toEqual([account.email]);

    mail.clear();
    await adminLogin(await newVisitor(), { email: account.email, password: PASSWORD }).expect(200, {
      status: 'code_required',
    });
    expect(mail.messages()).toHaveLength(0);

    await adminLogin(await newVisitor(), {
      email: account.email,
      password: PASSWORD,
      code: nextCode(secret),
    }).expect(200);
    expect(mail.messages().map((message) => message.to)).toEqual([account.email]);
  });

  it('asks for the code after a correct password, and signs in with a fresh TOTP code', async () => {
    const { account, secret } = await enrolAdministrator('code_admin');

    await adminLogin(await newVisitor(), { email: account.email, password: PASSWORD }).expect(200, {
      status: 'code_required',
    });
    const visitor = await newVisitor();
    await adminLogin(visitor, { email: account.email, password: PASSWORD, code: nextCode(secret) }).expect(
      200,
      {
        status: 'ok',
        user: { handle: 'code_admin', displayName: 'Compte code_admin' },
      },
    );
    await visitor.agent.get(`${BASE}/admin/session`).expect(200);
  });

  it('refuses a TOTP code a second time, even when it is still in the time window (replay)', async () => {
    const { account, secret } = await enrolAdministrator('replay_admin');
    const code = nextCode(secret);
    await adminLogin(await newVisitor(), { email: account.email, password: PASSWORD, code }).expect(200);

    await adminLogin(await newVisitor(), { email: account.email, password: PASSWORD, code }).expect(401);
  });

  it('accepts a backup code once, then refuses it', async () => {
    const { account, backupCodes } = await enrolAdministrator('backup_admin');

    await adminLogin(await newVisitor(), {
      email: account.email,
      password: PASSWORD,
      code: backupCodes[0],
    }).expect(200);
    await adminLogin(await newVisitor(), {
      email: account.email,
      password: PASSWORD,
      code: backupCodes[0],
    }).expect(401);
    expect(
      await sql(
        `SELECT count(*) FROM admin_backup_codes WHERE user_id = '${account.id}' AND used_at IS NOT NULL;`,
      ),
    ).toBe('1');
  });

  it('locks the account after five wrong codes, and refuses even the right password and code meanwhile', async () => {
    const { account, secret } = await enrolAdministrator('lock_admin');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await adminLogin(await newVisitor(), {
        email: account.email,
        password: PASSWORD,
        code: WRONG_CODE,
      }).expect(401);
    }

    const locked = await adminLogin(await newVisitor(), {
      email: account.email,
      password: PASSWORD,
      code: nextCode(secret),
    }).expect(401);
    expect(locked.body.detail).toBe('Identifiants incorrects');
    expect(await sql(`SELECT count(*) FROM users WHERE id = '${account.id}' AND locked_until > now();`)).toBe(
      '1',
    );
  });

  it('ends the back-office session after 30 minutes without a request', async () => {
    const { account, secret } = await enrolAdministrator('idle_admin');
    const visitor = await newVisitor();
    const login = await adminLogin(visitor, {
      email: account.email,
      password: PASSWORD,
      code: nextCode(secret),
    }).expect(200);

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
    const { account, secret } = await enrolAdministrator('long_admin');
    const visitor = await newVisitor();
    const login = await adminLogin(visitor, {
      email: account.email,
      password: PASSWORD,
      code: nextCode(secret),
    }).expect(200);

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
