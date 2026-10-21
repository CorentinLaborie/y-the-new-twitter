import { INestApplication } from '@nestjs/common';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaService } from '../src/database/prisma.service';
import { startApp } from './support/app';
import {
  BASE,
  createAccount,
  reauthenticateAdministrator,
  signedInAdministrator,
  newVisitor,
} from './support/back-office';
import { resetRateLimits } from './support/rate-limits';
import { startMigratedPostgres } from './support/postgres';

const REPORTS = `${BASE}/admin/reports`;

describe('Back-office reports (e2e, admin 2, DEC-085, DEC-088)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaService;

  type Admin = Awaited<ReturnType<typeof signedInAdministrator>>;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    process.env.DATABASE_URL = container.getConnectionUri();
    app = await startApp();
    prisma = app.get(PrismaService);
  }, 180_000);

  beforeEach(async () => {
    await resetRateLimits(app);
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  /** A question of a new account, with one open report by another account. */
  async function reportedQuestion(tag: string, reason: 'spam' | 'harassment' | 'hate', createdAt: Date) {
    const author = await createAccount(app, `${tag}_author`);
    const reporter = await createAccount(app, `${tag}_reporter`);
    const question = await prisma.question.create({
      data: { authorId: author.id, body: `Question ${tag}` },
    });
    const report = await prisma.report.create({
      data: { reporterId: reporter.id, questionId: question.id, reason, status: 'open', createdAt },
    });
    return { author, question, report };
  }

  /** The decision request of the administrator. */
  function decide(admin: Admin, reportId: string, body: Record<string, unknown>) {
    return admin.visitor.agent
      .put(`${REPORTS}/${reportId}/decision`)
      .set('x-csrf-token', admin.visitor.csrf)
      .send(body);
  }

  it('answers 404 to a visitor who is not an administrator', async () => {
    const visitor = await newVisitor(app);
    await visitor.agent.get(REPORTS).expect(404);
  });

  it('lists the open reports with the count of reports on their content, and filters by status and reason', async () => {
    const admin = await signedInAdministrator(app, 'rep_list_admin');
    const first = await reportedQuestion('rep_list_a', 'spam', new Date('2026-10-10T08:00:00.000Z'));
    await prisma.report.create({
      data: { reporterId: first.author.id, questionId: first.question.id, reason: 'hate', status: 'open' },
    });
    const second = await reportedQuestion('rep_list_b', 'harassment', new Date('2026-10-11T08:00:00.000Z'));
    await prisma.report.update({ where: { id: second.report.id }, data: { status: 'dismissed' } });

    const open = await admin.visitor.agent.get(REPORTS).query({ status: 'open' }).expect(200);
    const openIds = open.body.items.map((item: { id: string }) => item.id);
    expect(openIds).toEqual(expect.arrayContaining([first.report.id]));
    expect(openIds).not.toContain(second.report.id);
    const counted = open.body.items.find((item: { id: string }) => item.id === first.report.id);
    expect(counted.reportCount).toBe(2);
    expect(counted.target).toMatchObject({ type: 'question', authorHandle: 'rep_list_a_author' });
    expect(JSON.stringify(open.body)).not.toContain('@example.test');

    const decided = await admin.visitor.agent.get(REPORTS).query({ status: 'decided' }).expect(200);
    expect(decided.body.items.map((item: { id: string }) => item.id)).toEqual([second.report.id]);

    const harassment = await admin.visitor.agent.get(REPORTS).query({ reason: 'harassment' }).expect(200);
    expect(harassment.body.items.map((item: { id: string }) => item.id)).toEqual([second.report.id]);
  });

  it('pages the list with the cursor of the last row, and refuses a cursor that is not one', async () => {
    const admin = await signedInAdministrator(app, 'rep_page_admin');
    await reportedQuestion('rep_page_a', 'spam', new Date('2026-10-01T08:00:00.000Z'));
    await reportedQuestion('rep_page_b', 'spam', new Date('2026-10-02T08:00:00.000Z'));

    const firstPage = await admin.visitor.agent.get(REPORTS).query({ status: 'open', limit: 1 }).expect(200);
    expect(firstPage.body.items).toHaveLength(1);
    expect(firstPage.body.nextCursor).not.toBeNull();

    const secondPage = await admin.visitor.agent
      .get(REPORTS)
      .query({ status: 'open', limit: 1, cursor: firstPage.body.nextCursor })
      .expect(200);
    expect(secondPage.body.items[0].id).not.toBe(firstPage.body.items[0].id);

    await admin.visitor.agent.get(REPORTS).query({ cursor: 'garbage' }).expect(400);
  });

  it('shows one report with its content and the reports on it, and never the reporter or an e-mail address', async () => {
    const admin = await signedInAdministrator(app, 'rep_view_admin');
    const reported = await reportedQuestion('rep_view', 'spam', new Date('2026-10-10T08:00:00.000Z'));

    const response = await admin.visitor.agent.get(`${REPORTS}/${reported.report.id}`).expect(200);

    expect(response.body).toMatchObject({
      id: reported.report.id,
      reason: 'spam',
      status: 'open',
      decision: null,
      target: { type: 'question', id: reported.question.id, authorHandle: 'rep_view_author' },
    });
    expect(response.body.reports).toHaveLength(1);
    expect(response.body.reports[0]).not.toHaveProperty('reporterId');
    expect(JSON.stringify(response.body)).not.toContain('@example.test');
    await admin.visitor.agent.get(`${REPORTS}/${reported.question.id}`).expect(404);
  });

  it('refuses a decision without a re-authentication, with 403, and writes nothing', async () => {
    const admin = await signedInAdministrator(app, 'rep_gate_admin');
    const reported = await reportedQuestion('rep_gate', 'spam', new Date('2026-10-10T08:00:00.000Z'));

    const response = await decide(admin, reported.report.id, { decision: 'hide', note: 'Injure' }).expect(
      403,
    );

    expect(response.body.code).toBe('reauth_required');
    expect((await prisma.report.findUniqueOrThrow({ where: { id: reported.report.id } })).status).toBe(
      'open',
    );
    expect(
      (await prisma.question.findUniqueOrThrow({ where: { id: reported.question.id } })).moderationStatus,
    ).toBe('visible');
  });

  it('refuses a decision without a note, with 400, and writes nothing', async () => {
    const admin = await signedInAdministrator(app, 'rep_note_admin');
    const reported = await reportedQuestion('rep_note', 'spam', new Date('2026-10-10T08:00:00.000Z'));
    await reauthenticateAdministrator(admin);

    await decide(admin, reported.report.id, { decision: 'hide' }).expect(400);
    await decide(admin, reported.report.id, { decision: 'dismiss', note: '   ' }).expect(400);

    expect((await prisma.report.findUniqueOrThrow({ where: { id: reported.report.id } })).status).toBe(
      'open',
    );
  });

  it('hides the content: its open reports are resolved, the question is hidden, and the decision is audited', async () => {
    const admin = await signedInAdministrator(app, 'rep_hide_admin');
    const reported = await reportedQuestion('rep_hide', 'spam', new Date('2026-10-10T08:00:00.000Z'));
    const other = await prisma.report.create({
      data: {
        reporterId: reported.author.id,
        questionId: reported.question.id,
        reason: 'hate',
        status: 'open',
      },
    });
    await reauthenticateAdministrator(admin);

    const response = await decide(admin, reported.report.id, {
      decision: 'hide',
      note: 'Spam répété',
    }).expect(200);

    expect(response.body).toMatchObject({
      id: reported.report.id,
      status: 'resolved',
      decision: 'content_hidden',
    });
    const report = await prisma.report.findUniqueOrThrow({ where: { id: reported.report.id } });
    expect(report).toMatchObject({
      status: 'resolved',
      decision: 'content_hidden',
      decisionNote: 'Spam répété',
    });
    expect((await prisma.report.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('resolved');
    const question = await prisma.question.findUniqueOrThrow({ where: { id: reported.question.id } });
    expect(question.moderationStatus).toBe('hidden');
    expect(question.moderatedAt).not.toBeNull();

    const entry = await prisma.adminAuditLog.findFirstOrThrow({
      where: { action: 'report.decide', targetId: reported.report.id },
    });
    expect(entry).toMatchObject({
      actorId: admin.userId,
      result: 'ok',
      targetType: 'report',
      reason: 'Spam répété',
      details: { decision: 'hide' },
    });
  });

  it('dismisses a report without touching its content', async () => {
    const admin = await signedInAdministrator(app, 'rep_dismiss_admin');
    const reported = await reportedQuestion('rep_dismiss', 'spam', new Date('2026-10-10T08:00:00.000Z'));
    await reauthenticateAdministrator(admin);

    const response = await decide(admin, reported.report.id, {
      decision: 'dismiss',
      note: 'Pas de règle enfreinte',
    }).expect(200);

    expect(response.body).toMatchObject({ status: 'dismissed', decision: 'no_action' });
    expect((await prisma.report.findUniqueOrThrow({ where: { id: reported.report.id } })).status).toBe(
      'dismissed',
    );
    expect(
      (await prisma.question.findUniqueOrThrow({ where: { id: reported.question.id } })).moderationStatus,
    ).toBe('visible');
  });

  it('answers 409 to a second decision on a report already decided, and writes nothing more', async () => {
    const admin = await signedInAdministrator(app, 'rep_twice_admin');
    const reported = await reportedQuestion('rep_twice', 'spam', new Date('2026-10-10T08:00:00.000Z'));
    await reauthenticateAdministrator(admin);
    await decide(admin, reported.report.id, { decision: 'dismiss', note: 'Pas de règle' }).expect(200);
    await reauthenticateAdministrator(admin);

    const response = await decide(admin, reported.report.id, { decision: 'hide', note: 'Injure' }).expect(
      409,
    );

    expect(response.body.detail).toBe('Ce signalement a déjà été traité.');
    expect(
      (await prisma.question.findUniqueOrThrow({ where: { id: reported.question.id } })).moderationStatus,
    ).toBe('visible');
    expect(
      await prisma.adminAuditLog.count({ where: { action: 'report.decide', targetId: reported.report.id } }),
    ).toBe(1);
  });

  it('answers 404 to a decision on an unknown report', async () => {
    const admin = await signedInAdministrator(app, 'rep_unknown_admin');
    await reauthenticateAdministrator(admin);

    await decide(admin, '00000000-0000-4000-8000-000000000000', { decision: 'dismiss', note: 'Test' }).expect(
      404,
    );
  });
});
