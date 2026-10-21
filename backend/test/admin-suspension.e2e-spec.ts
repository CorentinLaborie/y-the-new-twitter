import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { ADMIN_REAUTH_WINDOW_MS } from '../src/admin/admin-session';
import { AuditLogService } from '../src/admin/audit/audit-log.service';
import { CapturingMailSender } from '../src/common/mail/capturing-mail-sender';
import { MAIL_SENDER } from '../src/common/mail/mail-sender';
import { PrismaService } from '../src/database/prisma.service';
import type { Prisma } from '../src/database/generated/client/client';
import { BASE, createAccount, enrol, newVisitor, PASSWORD, signIn } from './support/back-office';
import { resetRateLimits } from './support/rate-limits';
import { startMigratedPostgres } from './support/postgres';

const USERS = `${BASE}/admin/users`;
const MAIL_SUSPENDED = 'Votre compte Y est suspendu';
const MAIL_REACTIVATED = 'Votre compte Y est de nouveau actif';

describe('Back-office suspension and reactivation (e2e, DEC-077, DEC-088, DEC-116, DEC-192)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: CapturingMailSender;

  async function startApp(): Promise<INestApplication> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const created = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(created);
    await created.init();
    return created;
  }

  /**
   * A signed-in administrator. The backup codes after the first one are the queue of re-authentications: each one is
   * single-use, so the TOTP time window does not limit a test.
   */
  async function administrator(handle: string) {
    const account = await createAccount(app, handle, 'admin');
    const codes = await enrol(app, account);
    const visitor = await signIn(app, handle, codes[0]);
    return { visitor, userId: account.id, codes: codes.slice(1) };
  }

  /** A re-authentication with the password and the next backup code of the queue. */
  async function reauthenticate(admin: {
    visitor: { agent: ReturnType<typeof request.agent>; csrf: string };
    codes: string[];
  }) {
    await admin.visitor.agent
      .post(`${BASE}/admin/reauth`)
      .set('x-csrf-token', admin.visitor.csrf)
      .send({ password: PASSWORD, code: admin.codes.shift() })
      .expect(200);
  }

  /** The status change, as the administrator sends it. */
  function changeStatus(
    admin: { visitor: { agent: ReturnType<typeof request.agent>; csrf: string } },
    userId: string,
    body: Record<string, unknown>,
  ) {
    return admin.visitor.agent
      .put(`${USERS}/${userId}/status`)
      .set('x-csrf-token', admin.visitor.csrf)
      .send(body);
  }

  /** A user signed in on their own, so the account has a session to revoke. */
  async function userSignedIn(handle: string): Promise<void> {
    const visitor = await newVisitor(app);
    await visitor.agent
      .post(`${BASE}/auth/login`)
      .set('x-csrf-token', visitor.csrf)
      .send({ email: `${handle}@example.test`, password: PASSWORD })
      .expect(200);
  }

  /** The status e-mails only: the administrator sign-in alerts share the outbox. */
  function statusMails() {
    return mail
      .messages()
      .filter((sent) => sent.subject === MAIL_SUSPENDED || sent.subject === MAIL_REACTIVATED);
  }

  async function sessionsOf(userId: string): Promise<number> {
    return prisma.session.count({ where: { userId } });
  }

  async function accountOf(userId: string) {
    return prisma.user.findUniqueOrThrow({ where: { id: userId } });
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    process.env.DATABASE_URL = container.getConnectionUri();
    app = await startApp();
    prisma = app.get(PrismaService);
    mail = app.get<CapturingMailSender>(MAIL_SENDER);
  }, 180_000);

  beforeEach(async () => {
    await resetRateLimits(app);
    mail.clear();
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('answers 404 to a visitor who is not signed in as an administrator', async () => {
    const visitor = await newVisitor(app);
    const target = await createAccount(app, 'susp_anonymous');

    await visitor.agent
      .put(`${USERS}/${target.id}/status`)
      .set('x-csrf-token', visitor.csrf)
      .send({ status: 'suspended', reason: 'Test' })
      .expect(404);
  });

  it('refuses a change without a re-authentication, with 403 reauth_required, and changes nothing', async () => {
    const admin = await administrator('susp_gate_admin');
    const target = await createAccount(app, 'susp_gate_target');

    const response = await changeStatus(admin, target.id, {
      status: 'suspended',
      reason: 'Propos injurieux',
    }).expect(403);

    expect(response.body.code).toBe('reauth_required');
    expect((await accountOf(target.id)).status).toBe('active');
    expect(statusMails()).toHaveLength(0);
  });

  it('refuses a re-authentication older than 10 minutes, with 403, and keeps the 8-hour elevation', async () => {
    const admin = await administrator('susp_stale_admin');
    const target = await createAccount(app, 'susp_stale_target');
    await reauthenticate(admin);

    const row = await prisma.session.findFirstOrThrow({
      where: { userId: admin.userId },
      orderBy: { lastAccessAt: 'desc' },
    });
    const data = row.data as unknown as { adminReauthAt: string };
    data.adminReauthAt = new Date(Date.now() - ADMIN_REAUTH_WINDOW_MS - 60_000).toISOString();
    await prisma.session.update({
      where: { id: row.id },
      data: { data: data as unknown as Prisma.InputJsonObject },
    });

    const response = await changeStatus(admin, target.id, {
      status: 'suspended',
      reason: 'Propos injurieux',
    }).expect(403);

    expect(response.body.code).toBe('reauth_required');
    expect((await accountOf(target.id)).status).toBe('active');
  });

  it('answers 400 when the reason is missing or blank, and changes nothing', async () => {
    const admin = await administrator('susp_reason_admin');
    const target = await createAccount(app, 'susp_reason_target');
    await reauthenticate(admin);

    await changeStatus(admin, target.id, { status: 'suspended' }).expect(400);
    await changeStatus(admin, target.id, { status: 'suspended', reason: '   ' }).expect(400);
    expect((await accountOf(target.id)).status).toBe('active');
  });

  it('suspends an active account: status and reason, sessions revoked, e-mail sent, audit entry written', async () => {
    const admin = await administrator('susp_full_admin');
    const target = await createAccount(app, 'susp_full_target');
    await userSignedIn('susp_full_target');
    expect(await sessionsOf(target.id)).toBeGreaterThan(0);
    await reauthenticate(admin);

    const response = await changeStatus(admin, target.id, {
      status: 'suspended',
      reason: 'Propos injurieux',
    }).expect(200);

    expect(response.body).toMatchObject({
      id: target.id,
      status: 'suspended',
      suspensionReason: 'Propos injurieux',
    });
    const account = await accountOf(target.id);
    expect(account.status).toBe('suspended');
    expect(account.suspensionReason).toBe('Propos injurieux');
    expect(await sessionsOf(target.id)).toBe(0);

    const sent = statusMails();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'susp_full_target@example.test', subject: MAIL_SUSPENDED });
    expect(sent[0].text).toContain('Motif : Propos injurieux');

    const audit = await prisma.adminAuditLog.findMany({
      where: { targetId: target.id, action: 'user.suspend' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: admin.userId, result: 'ok', reason: 'Propos injurieux' });
  });

  it('refuses a second suspension (409), and the change of the administrator own account (409)', async () => {
    const admin = await administrator('susp_twice_admin');
    const target = await createAccount(app, 'susp_twice_target');
    await reauthenticate(admin);
    await changeStatus(admin, target.id, { status: 'suspended', reason: 'Premier' }).expect(200);

    await changeStatus(admin, target.id, { status: 'suspended', reason: 'Second' }).expect(409);
    await changeStatus(admin, admin.userId, { status: 'suspended', reason: 'Moi' }).expect(409);
    expect((await accountOf(target.id)).suspensionReason).toBe('Premier');
  });

  it('refuses a change from another status, such as a pending deletion (409)', async () => {
    const admin = await administrator('susp_status_admin');
    const target = await createAccount(app, 'susp_status_target');
    await prisma.user.update({ where: { id: target.id }, data: { status: 'pending_deletion' } });
    await reauthenticate(admin);

    await changeStatus(admin, target.id, { status: 'suspended', reason: 'Test' }).expect(409);
    await changeStatus(admin, target.id, { status: 'active', reason: 'Test' }).expect(409);
    expect((await accountOf(target.id)).status).toBe('pending_deletion');
  });

  it('lifts a suspension: the reason leaves the account, the audit keeps it, and the e-mail goes out', async () => {
    const admin = await administrator('susp_lift_admin');
    const target = await createAccount(app, 'susp_lift_target');
    await reauthenticate(admin);
    await changeStatus(admin, target.id, { status: 'suspended', reason: 'Propos injurieux' }).expect(200);
    mail.clear();
    await reauthenticate(admin);

    const response = await changeStatus(admin, target.id, {
      status: 'active',
      reason: 'Erreur de saisie',
    }).expect(200);

    expect(response.body).toMatchObject({ status: 'active', suspensionReason: null });
    const account = await accountOf(target.id);
    expect(account.status).toBe('active');
    expect(account.suspensionReason).toBeNull();
    expect(mail.messages()).toEqual([
      expect.objectContaining({ to: 'susp_lift_target@example.test', subject: MAIL_REACTIVATED }),
    ]);

    const audit = await prisma.adminAuditLog.findMany({
      where: { targetId: target.id, action: 'user.reactivate' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].reason).toBe('Erreur de saisie');
  });

  it('recounts the Y, the replies and the reactions of the account on suspension, and restores them on lifting (R13, DEC-192)', async () => {
    const admin = await administrator('susp_count_admin');
    const author = await createAccount(app, 'susp_count_author');
    const target = await createAccount(app, 'susp_count_target');
    const fan = await createAccount(app, 'susp_count_fan');
    const other = await createAccount(app, 'susp_count_other');
    const question = await prisma.question.create({
      data: { authorId: author.id, body: 'Question de test', yCount: 3, replyCount: 1 },
    });
    await prisma.questionReaction.createMany({
      data: [
        { userId: target.id, questionId: question.id, kind: 'y' },
        { userId: fan.id, questionId: question.id, kind: 'y' },
        { userId: other.id, questionId: question.id, kind: 'y' },
      ],
    });
    const reply = await prisma.reply.create({
      data: { questionId: question.id, authorId: target.id, body: 'Réponse de test', likeCount: 1 },
    });
    await prisma.replyReaction.create({ data: { userId: target.id, replyId: reply.id, kind: 'like' } });
    await reauthenticate(admin);

    await changeStatus(admin, target.id, { status: 'suspended', reason: 'Test de compte' }).expect(200);
    const suspended = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    const suspendedReply = await prisma.reply.findUniqueOrThrow({ where: { id: reply.id } });
    expect(suspended).toMatchObject({ yCount: 2, replyCount: 0 });
    expect(suspendedReply.likeCount).toBe(0);

    await reauthenticate(admin);
    await changeStatus(admin, target.id, { status: 'active', reason: 'Test de compte' }).expect(200);
    const lifted = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    const liftedReply = await prisma.reply.findUniqueOrThrow({ where: { id: reply.id } });
    expect(lifted).toMatchObject({ yCount: 3, replyCount: 1 });
    expect(liftedReply.likeCount).toBe(1);
  });

  it('closes the open contact thread at a lifting, and reopens it under the same reference at the next suspension (DEC-116)', async () => {
    const admin = await administrator('susp_thread_admin');
    const target = await createAccount(app, 'susp_thread_target');
    await prisma.user.update({
      where: { id: target.id },
      data: { status: 'suspended', suspensionReason: 'Test' },
    });
    const thread = await prisma.supportThread.create({
      data: { reference: 'CNT-20261021-0101', userId: target.id, status: 'new', openUserId: target.id },
    });
    await reauthenticate(admin);

    await changeStatus(admin, target.id, { status: 'active', reason: 'Erreur' }).expect(200);
    expect(await prisma.supportThread.findUniqueOrThrow({ where: { id: thread.id } })).toMatchObject({
      status: 'closed',
      closedByLift: true,
      openUserId: null,
      closedById: admin.userId,
    });
    const closing = await prisma.adminAuditLog.findMany({
      where: { targetId: thread.id, action: 'contact.close' },
    });
    expect(closing).toHaveLength(1);
    expect(closing[0].reason).toBeNull();

    await reauthenticate(admin);
    await changeStatus(admin, target.id, { status: 'suspended', reason: 'Récidive' }).expect(200);
    expect(await prisma.supportThread.findUniqueOrThrow({ where: { id: thread.id } })).toMatchObject({
      status: 'new',
      closedByLift: false,
      openUserId: target.id,
      reference: 'CNT-20261021-0101',
    });
  });

  it('leaves a thread closed with "Marquer comme traité" closed at a lifting', async () => {
    const admin = await administrator('susp_handled_admin');
    const target = await createAccount(app, 'susp_handled_target');
    await prisma.user.update({
      where: { id: target.id },
      data: { status: 'suspended', suspensionReason: 'Test' },
    });
    const thread = await prisma.supportThread.create({
      data: { reference: 'CNT-20261021-0102', userId: target.id, status: 'closed', closedByLift: false },
    });
    await reauthenticate(admin);

    await changeStatus(admin, target.id, { status: 'active', reason: 'Erreur' }).expect(200);

    expect(await prisma.supportThread.findUniqueOrThrow({ where: { id: thread.id } })).toMatchObject({
      status: 'closed',
      closedByLift: false,
    });
    expect(
      await prisma.adminAuditLog.count({ where: { targetId: thread.id, action: 'contact.close' } }),
    ).toBe(0);
  });

  it('rolls the suspension back when its audit entry cannot be written: status, sessions and no e-mail (DEC-088)', async () => {
    const admin = await administrator('susp_rollback_admin');
    const target = await createAccount(app, 'susp_rollback_target');
    await userSignedIn('susp_rollback_target');
    await reauthenticate(admin);
    const audit = app.get(AuditLogService);
    const failure = jest.spyOn(audit, 'appendIn').mockRejectedValueOnce(new Error('audit write failed'));

    await changeStatus(admin, target.id, { status: 'suspended', reason: 'Propos injurieux' }).expect(500);
    failure.mockRestore();

    const account = await accountOf(target.id);
    expect(account.status).toBe('active');
    expect(account.suspensionReason).toBeNull();
    expect(await sessionsOf(target.id)).toBeGreaterThan(0);
    expect(statusMails()).toHaveLength(0);
  });

  it('rolls the lifting back when its audit entry cannot be written: the status and the open thread stay as they were', async () => {
    const admin = await administrator('susp_rollback_lift_admin');
    const target = await createAccount(app, 'susp_rollback_lift_target');
    await reauthenticate(admin);
    await changeStatus(admin, target.id, { status: 'suspended', reason: 'Test' }).expect(200);
    const thread = await prisma.supportThread.create({
      data: { reference: 'CNT-20261021-0103', userId: target.id, status: 'new', openUserId: target.id },
    });
    await reauthenticate(admin);
    const audit = app.get(AuditLogService);
    const failure = jest.spyOn(audit, 'appendIn').mockRejectedValueOnce(new Error('audit write failed'));

    await changeStatus(admin, target.id, { status: 'active', reason: 'Erreur' }).expect(500);
    failure.mockRestore();

    expect((await accountOf(target.id)).status).toBe('suspended');
    expect(await prisma.supportThread.findUniqueOrThrow({ where: { id: thread.id } })).toMatchObject({
      status: 'new',
      closedByLift: false,
      openUserId: target.id,
    });
  });
});
