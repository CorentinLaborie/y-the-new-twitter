import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { AuditLogService } from '../src/admin/audit/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../src/admin/audit/audit-log.types';
import { stepAt, totpCode } from '../src/admin/mfa/totp';
import { hashPassword } from '../src/auth/password';
import { PrismaService } from '../src/database/prisma.service';
import { UsersRepository } from '../src/users/users.repository';
import { resetRateLimits } from './support/rate-limits';
import { runAsSuperuser, startMigratedPostgres } from './support/postgres';

const PASSWORD = 'Abcdef1!';
const BASE = '/api/v1';
const AUDIT = `${BASE}/admin/audit-log`;

describe('Back-office audit log (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersRepository;
  let audit: AuditLogService;

  async function startApp(): Promise<INestApplication> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const created = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(created);
    await created.init();
    return created;
  }

  async function newVisitor() {
    const agent = request.agent(app.getHttpServer());
    const status = await agent.get(`${BASE}/status`).expect(200);
    return { agent, csrf: cookieValue(status, 'y_csrf') ?? '' };
  }

  function cookieValue(response: request.Response, name: string): string | undefined {
    const cookies = (response.headers['set-cookie'] ?? []) as unknown as string[];
    return cookies.find((value) => value.startsWith(`${name}=`))?.split(';')[0].split('=')[1];
  }

  async function sql(statement: string): Promise<string> {
    return (await runAsSuperuser(container, statement)).stdout.trim();
  }

  async function createAdmin(handle: string): Promise<{ id: string; email: string }> {
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
    await prisma.user.update({ where: { id: user.id }, data: { status: 'active', role: 'admin' } });
    return { id: user.id, email: user.email };
  }

  /**
   * Enrols the second factor through the API. That writes auth.mfa_enrol. Returns the backup codes, which are
   * single-use, so later sign-ins in the same test do not depend on the TOTP time window.
   */
  async function enrol(account: { email: string }): Promise<string[]> {
    const visitor = await newVisitor();
    await visitor.agent
      .post(`${BASE}/admin/login`)
      .set('x-csrf-token', visitor.csrf)
      .send({ email: account.email, password: PASSWORD })
      .expect(200);
    const setup = await visitor.agent.post(`${BASE}/admin/mfa/setup`).set('x-csrf-token', visitor.csrf).expect(200);
    const confirmed = await visitor.agent
      .post(`${BASE}/admin/mfa/confirm`)
      .set('x-csrf-token', visitor.csrf)
      .send({ code: totpCode(setup.body.secret, stepAt(Date.now())) })
      .expect(201);
    return confirmed.body.backupCodes as string[];
  }

  /** A signed-in administrator, after the second factor with a backup code (writes auth.admin_login ok). */
  async function signIn(handle: string, backupCode: string) {
    const visitor = await newVisitor();
    await visitor.agent
      .post(`${BASE}/admin/login`)
      .set('x-csrf-token', visitor.csrf)
      .send({ email: `${handle}@example.test`, password: PASSWORD, code: backupCode })
      .expect(200);
    return visitor;
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    process.env.DATABASE_URL = container.getConnectionUri();
    app = await startApp();
    prisma = app.get(PrismaService);
    users = app.get(UsersRepository);
    audit = app.get(AuditLogService);
  }, 180_000);

  beforeEach(async () => {
    await resetRateLimits(app);
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('answers 404 to a visitor who is not signed in as an administrator', async () => {
    const visitor = await newVisitor();

    await visitor.agent.get(AUDIT).expect(404);
    await visitor.agent.get(`${AUDIT}/verify`).expect(404);
  });

  it('writes the set-up and each sign-in, and lists them newest first', async () => {
    const admin = await createAdmin('audit_admin');
    const [code] = await enrol(admin);
    const visitor = await signIn('audit_admin', code);

    const listed = await visitor.agent.get(AUDIT).expect(200);

    const actions = listed.body.items.map((item: { action: string }) => item.action);
    expect(actions[0]).toBe(AUDIT_ACTIONS.adminLogin);
    expect(actions).toContain(AUDIT_ACTIONS.mfaEnrol);
    expect(listed.body.items[0]).toMatchObject({
      actorId: admin.id,
      result: 'ok',
      targetType: AUDIT_TARGET_TYPES.user,
      targetId: admin.id,
      reason: null,
      details: null,
    });
  });

  it('records a wrong second factor as a failed sign-in', async () => {
    const admin = await createAdmin('failed_admin');
    await enrol(admin);
    const visitor = await newVisitor();

    await visitor.agent
      .post(`${BASE}/admin/login`)
      .set('x-csrf-token', visitor.csrf)
      .send({ email: admin.email, password: PASSWORD, code: '000000' })
      .expect(401);

    expect(
      await sql(
        `SELECT count(*) FROM admin_audit_log WHERE actor_id = '${admin.id}' AND action = '${AUDIT_ACTIONS.adminLogin}' AND result = 'failed';`,
      ),
    ).toBe('1');
  });

  it('filters by action and pages with a cursor, without repeating an entry', async () => {
    const admin = await createAdmin('paging_admin');
    const [first, second] = await enrol(admin);
    const visitor = await signIn('paging_admin', first);
    await signIn('paging_admin', second);

    const page1 = await visitor.agent.get(`${AUDIT}?limit=1&action=${AUDIT_ACTIONS.adminLogin}`).expect(200);
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.items[0].action).toBe(AUDIT_ACTIONS.adminLogin);
    expect(page1.body.nextCursor).not.toBeNull();

    const page2 = await visitor.agent
      .get(`${AUDIT}?limit=1&action=${AUDIT_ACTIONS.adminLogin}&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
      .expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
  });

  it('refuses a cursor that is not one of its own', async () => {
    const admin = await createAdmin('cursor_admin');
    const [code] = await enrol(admin);
    const visitor = await signIn('cursor_admin', code);

    await visitor.agent.get(`${AUDIT}?cursor=garbage`).expect(400);
  });

  it('keeps the chain valid when entries are written at the same time (the chain lock)', async () => {
    const before = Number(await sql('SELECT count(*) FROM admin_audit_log;'));

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        audit.append({
          actorId: null,
          action: AUDIT_ACTIONS.adminLogin,
          result: 'failed',
          targetType: AUDIT_TARGET_TYPES.user,
          targetId: '00000000-0000-4000-8000-0000000000aa',
          reason: `parallel ${index}`,
          details: null,
        }),
      ),
    );

    expect(Number(await sql('SELECT count(*) FROM admin_audit_log;'))).toBe(before + 20);
    expect(await audit.verify()).toEqual({ valid: true, brokenAt: null, checked: before + 20 });
  });

  it('reports the entry where the chain breaks when a row is changed in the database', async () => {
    const admin = await createAdmin('tamper_admin');
    const [code] = await enrol(admin);
    const visitor = await signIn('tamper_admin', code);
    const total = Number(await sql('SELECT count(*) FROM admin_audit_log;'));
    const changed = await sql(
      `UPDATE admin_audit_log SET reason = 'changed afterwards' WHERE id = (SELECT id FROM admin_audit_log ORDER BY created_at ASC, id ASC OFFSET 1 LIMIT 1) RETURNING id;`,
    );
    expect(changed).not.toBe('');

    const check = await visitor.agent.get(`${AUDIT}/verify`).expect(200);

    expect(check.body.valid).toBe(false);
    expect(check.body.brokenAt).toBe(2);
    expect(check.body.checked).toBe(total);
  });
});
