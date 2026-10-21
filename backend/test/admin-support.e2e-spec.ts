import { INestApplication } from '@nestjs/common';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { CapturingMailSender } from '../src/common/mail/capturing-mail-sender';
import { MAIL_SENDER } from '../src/common/mail/mail-sender';
import { PrismaService } from '../src/database/prisma.service';
import { startApp } from './support/app';
import {
  BASE,
  createAccount,
  newVisitor,
  reauthenticateAdministrator,
  signedInAdministrator,
} from './support/back-office';
import { resetRateLimits } from './support/rate-limits';
import { startMigratedPostgres } from './support/postgres';

const THREADS = `${BASE}/admin/support-threads`;
const REPLY_MAIL_SUBJECT = 'Réponse de l’équipe Y à votre message';

describe('Back-office contact threads (e2e, admin 2, DEC-116)', () => {
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

  /** A suspended account with an open thread, whose first message is written as the account would write it. */
  async function openThread(tag: string, reference: string) {
    const account = await createAccount(app, tag);
    await prisma.user.update({
      where: { id: account.id },
      data: { status: 'suspended', suspensionReason: 'Propos injurieux', statusChangedAt: new Date() },
    });
    const thread = await prisma.supportThread.create({
      data: { reference, userId: account.id, status: 'new', openUserId: account.id },
    });
    await prisma.supportMessage.create({
      data: {
        threadId: thread.id,
        authorType: 'user',
        authorUserId: account.id,
        body: 'Pouvez-vous réexaminer ma situation ?',
      },
    });
    return { account, thread };
  }

  function reply(admin: Admin, threadId: string, body: Record<string, unknown>) {
    return admin.visitor.agent
      .post(`${THREADS}/${threadId}/messages`)
      .set('x-csrf-token', admin.visitor.csrf)
      .send(body);
  }

  function close(admin: Admin, threadId: string) {
    return admin.visitor.agent.put(`${THREADS}/${threadId}/close`).set('x-csrf-token', admin.visitor.csrf);
  }

  it('answers 404 to a visitor who is not an administrator', async () => {
    const visitor = await newVisitor(app);
    await visitor.agent.get(THREADS).expect(404);
  });

  it('lists the open threads and the closed ones apart, with the latest message and the masked address', async () => {
    const admin = await signedInAdministrator(app, 'sup_list_admin');
    const open = await openThread('sup_list_open', 'CNT-20261018-0901');
    const closedOne = await openThread('sup_list_closed', 'CNT-20261018-0902');
    await prisma.supportThread.update({
      where: { id: closedOne.thread.id },
      data: { status: 'closed', closedAt: new Date(), openUserId: null, closedById: admin.userId },
    });

    const openPage = await admin.visitor.agent.get(THREADS).query({ status: 'open' }).expect(200);
    const openItem = openPage.body.items.find((item: { id: string }) => item.id === open.thread.id);
    expect(openItem).toMatchObject({
      reference: 'CNT-20261018-0901',
      status: 'new',
      latestMessage: 'Pouvez-vous réexaminer ma situation ?',
      account: { handle: 'sup_list_open', status: 'suspended', maskedEmail: 's***@e***.test' },
    });
    expect(openPage.body.items.map((item: { id: string }) => item.id)).not.toContain(closedOne.thread.id);
    expect(JSON.stringify(openPage.body)).not.toContain('sup_list_open@example.test');

    const closedPage = await admin.visitor.agent.get(THREADS).query({ status: 'closed' }).expect(200);
    expect(closedPage.body.items.map((item: { id: string }) => item.id)).toEqual([closedOne.thread.id]);
  });

  it('shows one thread with all its messages in order, and the account without its e-mail address', async () => {
    const admin = await signedInAdministrator(app, 'sup_view_admin');
    const { account, thread } = await openThread('sup_view', 'CNT-20261018-0903');

    const response = await admin.visitor.agent.get(`${THREADS}/${thread.id}`).expect(200);

    expect(response.body).toMatchObject({
      id: thread.id,
      reference: 'CNT-20261018-0903',
      status: 'new',
      account: { id: account.id, handle: 'sup_view', suspensionReason: 'Propos injurieux' },
    });
    expect(response.body.messages).toEqual([
      expect.objectContaining({ authorType: 'user', body: 'Pouvez-vous réexaminer ma situation ?' }),
    ]);
    expect(JSON.stringify(response.body)).not.toContain('sup_view@example.test');
    await admin.visitor.agent.get(`${THREADS}/00000000-0000-4000-8000-000000000000`).expect(404);
  });

  it('sends an answer by e-mail, stores it as an administrator message, audits it, and needs no re-authentication', async () => {
    const admin = await signedInAdministrator(app, 'sup_reply_admin');
    const { thread } = await openThread('sup_reply', 'CNT-20261018-0904');

    const response = await reply(admin, thread.id, { text: '  Votre suspension reste en place.  ' }).expect(
      201,
    );

    expect(response.body.status).toBe('replied');
    expect(response.body.messages.at(-1)).toMatchObject({
      authorType: 'admin',
      body: 'Votre suspension reste en place.',
    });
    const stored = await prisma.supportMessage.findFirstOrThrow({
      where: { threadId: thread.id, authorType: 'admin' },
    });
    expect(stored).toMatchObject({ authorUserId: admin.userId, channel: 'email' });

    const sent = mail.messages().filter((message) => message.subject === REPLY_MAIL_SUBJECT);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('sup_reply@example.test');
    expect(sent[0]?.text).toContain('CNT-20261018-0904');

    expect(
      await prisma.adminAuditLog.count({
        where: { action: 'contact.reply', targetType: 'contact', targetId: thread.id },
      }),
    ).toBe(1);
  });

  it('refuses a blank answer and an answer over 1000 characters, with 400, and sends nothing', async () => {
    const admin = await signedInAdministrator(app, 'sup_bounds_admin');
    const { thread } = await openThread('sup_bounds', 'CNT-20261018-0905');

    await reply(admin, thread.id, { text: '   ' }).expect(400);
    await reply(admin, thread.id, { text: 'a'.repeat(1001) }).expect(400);

    expect(await prisma.supportMessage.count({ where: { threadId: thread.id, authorType: 'admin' } })).toBe(
      0,
    );
    expect(mail.messages().filter((message) => message.subject === REPLY_MAIL_SUBJECT)).toHaveLength(0);
  });

  it('closes a thread after a re-authentication, without e-mail, frees the account, and refuses any later answer or closing', async () => {
    const admin = await signedInAdministrator(app, 'sup_close_admin');
    const { thread } = await openThread('sup_close', 'CNT-20261018-0906');

    const refused = await close(admin, thread.id).expect(403);
    expect(refused.body.code).toBe('reauth_required');
    expect((await prisma.supportThread.findUniqueOrThrow({ where: { id: thread.id } })).status).toBe('new');

    await reauthenticateAdministrator(admin);
    const response = await close(admin, thread.id).expect(200);

    expect(response.body).toMatchObject({ status: 'closed', closedByLift: false });
    expect(await prisma.supportThread.findUniqueOrThrow({ where: { id: thread.id } })).toMatchObject({
      status: 'closed',
      closedById: admin.userId,
      closedByLift: false,
      openUserId: null,
    });
    expect(
      await prisma.adminAuditLog.count({
        where: { action: 'contact.close', targetType: 'contact', targetId: thread.id },
      }),
    ).toBe(1);
    expect(mail.messages().filter((message) => message.subject === REPLY_MAIL_SUBJECT)).toHaveLength(0);

    await reply(admin, thread.id, { text: 'Trop tard' }).expect(409);
    await reauthenticateAdministrator(admin);
    await close(admin, thread.id).expect(409);
  });
});
