import { INestApplication } from '@nestjs/common';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaService } from '../src/database/prisma.service';
import { startApp } from './support/app';
import { BASE, createAccount, newVisitor, signedInAdministrator } from './support/back-office';
import { resetRateLimits } from './support/rate-limits';
import { startMigratedPostgres } from './support/postgres';

const DASHBOARD = `${BASE}/admin/dashboard`;
const DAY_MS = 24 * 60 * 60 * 1000;

describe('Back-office dashboard indicators (e2e, admin 3)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaService;

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

  /** A report by a reporter on a question of an author. The times are given, so the figures are known. */
  async function report(
    tag: string,
    data: { createdAt: Date; status?: 'open' | 'resolved'; reviewedAt?: Date },
  ) {
    const author = await createAccount(app, `${tag}_author`);
    const reporter = await createAccount(app, `${tag}_reporter`);
    const question = await prisma.question.create({ data: { authorId: author.id, body: `Question ${tag}` } });
    return prisma.report.create({
      data: {
        reporterId: reporter.id,
        questionId: question.id,
        reason: 'spam',
        status: data.status ?? 'open',
        createdAt: data.createdAt,
        reviewedAt: data.reviewedAt ?? null,
      },
    });
  }

  it('gives the open reports, the oldest one, the mean handling time of the last 30 days, and the pending deletions', async () => {
    const admin = await signedInAdministrator(app, 'dash_admin');
    const now = Date.now();
    const oldest = new Date(now - 6 * DAY_MS);
    await report('dash_oldest', { createdAt: oldest });
    await report('dash_recent', { createdAt: new Date(now - DAY_MS) });
    // Decided one day ago, two hours after its opening: the only report of the 30-day window.
    await report('dash_decided', {
      createdAt: new Date(now - DAY_MS - 2 * 60 * 60 * 1000),
      status: 'resolved',
      reviewedAt: new Date(now - DAY_MS),
    });
    // Decided 40 days ago: outside the window, so it does not count in the mean.
    await report('dash_old', {
      createdAt: new Date(now - 41 * DAY_MS),
      status: 'resolved',
      reviewedAt: new Date(now - 40 * DAY_MS),
    });
    const later = await createAccount(app, 'dash_purge_later');
    const sooner = await createAccount(app, 'dash_purge_sooner');
    await prisma.user.update({
      where: { id: later.id },
      data: { status: 'pending_deletion', deletionPurgeAt: new Date(now + 80 * DAY_MS) },
    });
    await prisma.user.update({
      where: { id: sooner.id },
      data: { status: 'pending_deletion', deletionPurgeAt: new Date(now + 10 * DAY_MS) },
    });

    const response = await admin.visitor.agent.get(DASHBOARD).expect(200);

    expect(response.body).toEqual({
      openReportCount: 2,
      oldestOpenReportAt: oldest.toISOString(),
      averageHandlingSeconds: 2 * 60 * 60,
      pendingDeletionCount: 2,
      nextPurgeAt: new Date(now + 10 * DAY_MS).toISOString(),
    });
  });

  it('answers 404 to a visitor who is not an administrator', async () => {
    const visitor = await newVisitor(app);
    await visitor.agent.get(DASHBOARD).expect(404);
  });
});
