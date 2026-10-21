import { INestApplication } from '@nestjs/common';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { CapturingMailSender } from '../src/common/mail/capturing-mail-sender';
import { MAIL_SENDER } from '../src/common/mail/mail-sender';
import { PrismaService } from '../src/database/prisma.service';
import { startApp } from './support/app';
import {
  BASE,
  createAccount,
  reauthenticateAdministrator,
  signedInAdministrator,
} from './support/back-office';
import { resetRateLimits } from './support/rate-limits';
import { startMigratedPostgres } from './support/postgres';

const ACCOUNTS = `${BASE}/admin/users`;

describe('Back-office account deletion and its contact thread (e2e, owner decision 2026-10-21)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: CapturingMailSender;

  type Admin = Awaited<ReturnType<typeof signedInAdministrator>>;

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

  /** A suspended account with a thread, its first message written by the account. */
  async function suspendedWithThread(tag: string, reference: string) {
    const account = await createAccount(app, tag);
    await prisma.user.update({
      where: { id: account.id },
      data: { status: 'suspended', suspensionReason: 'Propos injurieux', statusChangedAt: new Date() },
    });
    const thread = await prisma.supportThread.create({
      data: { reference, userId: account.id, status: 'new', openUserId: account.id },
    });
    await prisma.supportMessage.create({
      data: { threadId: thread.id, authorType: 'user', authorUserId: account.id, body: 'Ma situation ?' },
    });
    return { account, thread };
  }

  function startDeletion(admin: Admin, accountId: string) {
    return admin.visitor.agent
      .put(`${ACCOUNTS}/${accountId}/deletion`)
      .set('x-csrf-token', admin.visitor.csrf)
      .send({ reasonCode: 'spam' });
  }

  it('closes the open contact thread with the deletion, without a lifting, and logs it', async () => {
    const admin = await signedInAdministrator(app, 'del_thread_admin');
    const { account, thread } = await suspendedWithThread('del_thread_open', 'CNT-20261021-1001');
    await reauthenticateAdministrator(admin);

    await startDeletion(admin, account.id).expect(200);

    const closed = await prisma.supportThread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(closed).toMatchObject({
      status: 'closed',
      closedByLift: false,
      openUserId: null,
      closedById: admin.userId,
    });
    expect(closed.closedAt).not.toBeNull();

    const closing = await prisma.adminAuditLog.findMany({
      where: { targetId: thread.id, action: 'contact.close' },
    });
    expect(closing).toHaveLength(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: account.id } })).status).toBe(
      'pending_deletion',
    );
  });

  it('keeps a thread that was already closed as it is, and logs no contact.close', async () => {
    const admin = await signedInAdministrator(app, 'del_thread_admin_closed');
    const { account, thread } = await suspendedWithThread('del_thread_closed', 'CNT-20261021-1002');
    const closedAt = new Date('2026-10-20T10:00:00.000Z');
    await prisma.supportThread.update({
      where: { id: thread.id },
      data: { status: 'closed', closedAt, closedById: admin.userId, closedByLift: false, openUserId: null },
    });
    await reauthenticateAdministrator(admin);

    await startDeletion(admin, account.id).expect(200);

    const unchanged = await prisma.supportThread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(unchanged.closedAt).toEqual(closedAt);
    expect(
      await prisma.adminAuditLog.count({ where: { targetId: thread.id, action: 'contact.close' } }),
    ).toBe(0);
  });
});
