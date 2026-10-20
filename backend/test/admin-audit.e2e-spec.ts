import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { configureApp } from '../src/configure-app';
import { AuditLogService } from '../src/admin/audit/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../src/admin/audit/audit-log.types';
import { BASE, createAccount, enrol, newVisitor, PASSWORD, signIn } from './support/back-office';
import { resetRateLimits } from './support/rate-limits';
import { runAsSuperuser, startMigratedPostgres } from './support/postgres';

const AUDIT = `${BASE}/admin/audit-log`;

describe('Back-office audit log (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
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

  async function sql(statement: string): Promise<string> {
    return (await runAsSuperuser(container, statement)).stdout.trim();
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    process.env.DATABASE_URL = container.getConnectionUri();
    app = await startApp();
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
    const visitor = await newVisitor(app);

    await visitor.agent.get(AUDIT).expect(404);
    await visitor.agent.get(`${AUDIT}/verify`).expect(404);
  });

  it('writes the set-up and each sign-in, and lists them newest first', async () => {
    const admin = await createAccount(app, 'audit_admin', 'admin');
    const [code] = await enrol(app, admin);
    const visitor = await signIn(app, 'audit_admin', code);

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
    const admin = await createAccount(app, 'failed_admin', 'admin');
    await enrol(app, admin);
    const visitor = await newVisitor(app);

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
    const admin = await createAccount(app, 'paging_admin', 'admin');
    const [first, second] = await enrol(app, admin);
    const visitor = await signIn(app, 'paging_admin', first);
    await signIn(app, 'paging_admin', second);

    const page1 = await visitor.agent.get(`${AUDIT}?limit=1&action=${AUDIT_ACTIONS.adminLogin}`).expect(200);
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.items[0].action).toBe(AUDIT_ACTIONS.adminLogin);
    expect(page1.body.nextCursor).not.toBeNull();

    const page2 = await visitor.agent
      .get(
        `${AUDIT}?limit=1&action=${AUDIT_ACTIONS.adminLogin}&cursor=${encodeURIComponent(page1.body.nextCursor)}`,
      )
      .expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
  });

  it('refuses a cursor that is not one of its own', async () => {
    const admin = await createAccount(app, 'cursor_admin', 'admin');
    const [code] = await enrol(app, admin);
    const visitor = await signIn(app, 'cursor_admin', code);

    await visitor.agent.get(`${AUDIT}?cursor=garbage`).expect(400);
  });

  it('lists 20 entries by default, accepts a limit of 50 and refuses a limit of 51', async () => {
    const admin = await createAccount(app, 'limit_admin', 'admin');
    const [code] = await enrol(app, admin);
    const visitor = await signIn(app, 'limit_admin', code);
    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        audit.append({
          actorId: null,
          action: AUDIT_ACTIONS.adminLogin,
          result: 'failed',
          targetType: AUDIT_TARGET_TYPES.user,
          targetId: '00000000-0000-4000-8000-0000000000bb',
          reason: `limit ${index}`,
          details: null,
        }),
      ),
    );
    const total = Number(await sql('SELECT count(*) FROM admin_audit_log;'));
    expect(total).toBeGreaterThan(20);

    const byDefault = await visitor.agent.get(AUDIT).expect(200);
    expect(byDefault.body.items).toHaveLength(20);

    const atMax = await visitor.agent.get(`${AUDIT}?limit=50`).expect(200);
    expect(atMax.body.items).toHaveLength(Math.min(total, 50));

    await visitor.agent.get(`${AUDIT}?limit=51`).expect(400);
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
    const admin = await createAccount(app, 'tamper_admin', 'admin');
    const [code] = await enrol(app, admin);
    const visitor = await signIn(app, 'tamper_admin', code);
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
