import { INestApplication } from '@nestjs/common';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaService } from '../src/database/prisma.service';
import { startApp } from './support/app';
import {
  BASE,
  PASSWORD,
  createAccount,
  newVisitor,
  reauthenticateAdministrator,
  signedInAdministrator,
} from './support/back-office';
import { resetRateLimits } from './support/rate-limits';
import { startMigratedPostgres } from './support/postgres';

const REPORTS = `${BASE}/admin/reports`;
const QUESTIONS = `${BASE}/questions`;

describe('Restoration of moderated content (e2e, L7)', () => {
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

  /** A question of a new account, with one open report by another account. */
  async function reportedQuestion(tag: string) {
    const author = await createAccount(app, `${tag}_author`);
    const reporter = await createAccount(app, `${tag}_reporter`);
    const question = await prisma.question.create({
      data: { authorId: author.id, body: `Question ${tag}` },
    });
    const report = await prisma.report.create({
      data: { reporterId: reporter.id, questionId: question.id, reason: 'spam', status: 'open' },
    });
    return { author, question, report };
  }

  /** A user signed in on their own account, to read the question as its author or as another user. */
  async function userSignedIn(handle: string) {
    const visitor = await newVisitor(app);
    await visitor.agent
      .post(`${BASE}/auth/login`)
      .set('x-csrf-token', visitor.csrf)
      .send({ email: `${handle}@example.test`, password: PASSWORD })
      .expect(200);
    return visitor;
  }

  function decide(admin: { visitor: Visitor }, reportId: string, body: Record<string, unknown>) {
    return admin.visitor.agent
      .put(`${REPORTS}/${reportId}/decision`)
      .set('x-csrf-token', admin.visitor.csrf)
      .send(body);
  }

  function restore(admin: { visitor: Visitor }, reportId: string, body: Record<string, unknown>) {
    return admin.visitor.agent
      .put(`${REPORTS}/${reportId}/restore`)
      .set('x-csrf-token', admin.visitor.csrf)
      .send(body);
  }

  function readQuestion(visitor: Visitor, questionId: string) {
    return visitor.agent.get(`${QUESTIONS}/${questionId}`);
  }

  it('shows the author that the question was removed, without its text; other users get 404 (L7)', async () => {
    const admin = await signedInAdministrator(app, 'rst_hide_admin');
    const reported = await reportedQuestion('rst_hide');
    await reauthenticateAdministrator(admin);
    await decide(admin, reported.report.id, { decision: 'hide', note: 'Spam répété' }).expect(200);

    const author = await userSignedIn('rst_hide_author');
    const response = await readQuestion(author, reported.question.id).expect(200);
    expect(response.body).toMatchObject({
      id: reported.question.id,
      text: '',
      hashtags: [],
      removedByModeration: true,
    });

    const other = await userSignedIn('rst_hide_reporter');
    await readQuestion(other, reported.question.id).expect(404);
  });

  it('refuses a restoration without a re-authentication, with 403, and changes nothing', async () => {
    const admin = await signedInAdministrator(app, 'rst_reauth_admin');
    const reported = await reportedQuestion('rst_reauth');
    await reauthenticateAdministrator(admin);
    await decide(admin, reported.report.id, { decision: 'hide', note: 'Injure' }).expect(200);
    // A new session, without a re-authentication: the restoration is refused (DEC-088).
    const fresh = await signedInAdministrator(app, 'rst_reauth_second');
    const response = await restore(fresh, reported.report.id, { note: 'Erreur' }).expect(403);

    expect(response.body.code).toBe('reauth_required');
    expect(
      (await prisma.question.findUniqueOrThrow({ where: { id: reported.question.id } })).moderationStatus,
    ).toBe('hidden');
  });

  it('restores the hidden question: it is visible again for everyone, and the restoration is audited', async () => {
    const admin = await signedInAdministrator(app, 'rst_back_admin');
    const reported = await reportedQuestion('rst_back');
    await reauthenticateAdministrator(admin);
    await decide(admin, reported.report.id, { decision: 'hide', note: 'Spam répété' }).expect(200);
    await reauthenticateAdministrator(admin);

    const response = await restore(admin, reported.report.id, { note: 'Signalement erroné' }).expect(200);

    expect(response.body).toMatchObject({ id: reported.report.id });
    expect(
      (await prisma.question.findUniqueOrThrow({ where: { id: reported.question.id } })).moderationStatus,
    ).toBe('visible');
    const entry = await prisma.adminAuditLog.findFirstOrThrow({
      where: { action: 'report.restore', targetId: reported.report.id },
    });
    expect(entry).toMatchObject({
      actorId: admin.userId,
      result: 'ok',
      targetType: 'report',
      reason: 'Signalement erroné',
    });

    const reader = await userSignedIn('rst_back_reporter');
    const visible = await readQuestion(reader, reported.question.id).expect(200);
    expect(visible.body).toMatchObject({ text: `Question rst_back`, removedByModeration: false });
  });

  it('answers 409 to a restoration of a report that did not hide the content, and to a second one', async () => {
    const admin = await signedInAdministrator(app, 'rst_twice_admin');
    const dismissed = await reportedQuestion('rst_dismissed');
    await reauthenticateAdministrator(admin);
    await decide(admin, dismissed.report.id, { decision: 'dismiss', note: 'Pas de règle' }).expect(200);
    await reauthenticateAdministrator(admin);
    const notHidden = await restore(admin, dismissed.report.id, { note: 'Erreur' }).expect(409);
    expect(notHidden.body.detail).toBe('Ce contenu n’est pas masqué : rien à restaurer.');

    const hidden = await reportedQuestion('rst_twice');
    await reauthenticateAdministrator(admin);
    await decide(admin, hidden.report.id, { decision: 'hide', note: 'Injure' }).expect(200);
    await reauthenticateAdministrator(admin);
    await restore(admin, hidden.report.id, { note: 'Erreur' }).expect(200);
    await reauthenticateAdministrator(admin);
    await restore(admin, hidden.report.id, { note: 'Encore' }).expect(409);
    expect(
      await prisma.adminAuditLog.count({ where: { action: 'report.restore', targetId: hidden.report.id } }),
    ).toBe(1);
  });
});

type Visitor = Awaited<ReturnType<typeof newVisitor>>;
