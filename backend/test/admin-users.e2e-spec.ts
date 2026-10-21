import { INestApplication } from '@nestjs/common';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaService } from '../src/database/prisma.service';
import { startApp } from './support/app';
import { BASE, createAccount, enrol, newVisitor, PASSWORD, signIn } from './support/back-office';
import { resetRateLimits } from './support/rate-limits';
import { startMigratedPostgres } from './support/postgres';

const ACCOUNTS = `${BASE}/admin/users`;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Back-office account search and view (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaService;
  let alice: { id: string; email: string };
  let bruno: { id: string; email: string };
  let chloe: { id: string; email: string };
  let reporter: { id: string; email: string };
  let admin: { id: string; email: string };
  let visitor: Awaited<ReturnType<typeof signIn>>;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    process.env.DATABASE_URL = container.getConnectionUri();
    app = await startApp();
    prisma = app.get(PrismaService);

    admin = await createAccount(app, 'usrsearch_admin', 'admin');
    alice = await createAccount(app, 'usrsearch_alice');
    bruno = await createAccount(app, 'usrsearch_bruno');
    chloe = await createAccount(app, 'usrsearch_chloe');
    reporter = await createAccount(app, 'usrsearch_reporter');
    await prisma.user.update({
      where: { id: bruno.id },
      data: { status: 'suspended', suspensionReason: 'Propos injurieux', statusChangedAt: new Date() },
    });
    const adminCodes = await enrol(app, admin);
    visitor = await signIn(app, 'usrsearch_admin', adminCodes[0]);
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

    await visitor.agent.get(ACCOUNTS).expect(404);
    await visitor.agent.get(`${ACCOUNTS}/${alice.id}`).expect(404);
  });

  it('answers 404 to an administrator whose password alone was given: no session is started before the second factor', async () => {
    await createAccount(app, 'gate_admin', 'admin');
    const visitor = await newVisitor(app);
    await visitor.agent
      .post(`${BASE}/admin/login`)
      .set('x-csrf-token', visitor.csrf)
      .send({ email: 'gate_admin@example.test', password: PASSWORD })
      .expect(200);

    await visitor.agent.get(ACCOUNTS).expect(404);
  });

  describe('once signed in as an administrator', () => {
    it('lists the accounts matching the search, without any full e-mail address', async () => {
      const listed = await visitor.agent.get(`${ACCOUNTS}?q=usrsearch_`).expect(200);

      expect(handles(listed.body.items)).toEqual(
        expect.arrayContaining([
          'usrsearch_admin',
          'usrsearch_alice',
          'usrsearch_bruno',
          'usrsearch_chloe',
          'usrsearch_reporter',
        ]),
      );
      expect(listed.text).not.toContain('@example.test');
      expect(listed.body.items[0].maskedEmail).toMatch(/^[^@]\*\*\*@[^@]\*\*\*\.test$/);
    });

    it('matches a handle without regard to case', async () => {
      const listed = await visitor.agent.get(`${ACCOUNTS}?q=USRSEARCH_ALI`).expect(200);

      expect(handles(listed.body.items)).toEqual(['usrsearch_alice']);
    });

    it('matches a full e-mail address', async () => {
      const listed = await visitor.agent.get(`${ACCOUNTS}?q=${chloe.email}`).expect(200);

      expect(handles(listed.body.items)).toEqual(['usrsearch_chloe']);
    });

    it('treats a blank search as no search', async () => {
      const blank = await visitor.agent.get(`${ACCOUNTS}?q=%20%20%20`).expect(200);
      const plain = await visitor.agent.get(ACCOUNTS).expect(200);

      expect(blank.body).toEqual(plain.body);
    });

    it('filters by status', async () => {
      const listed = await visitor.agent.get(`${ACCOUNTS}?q=usrsearch_&status=suspended`).expect(200);

      expect(handles(listed.body.items)).toEqual(['usrsearch_bruno']);
      expect(listed.body.items[0].status).toBe('suspended');
    });

    it('pages through the matches without repeating or skipping one', async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;

      do {
        const path: string = `${ACCOUNTS}?q=usrsearch_&limit=2${cursor === null ? '' : `&cursor=${cursor}`}`;
        const page = await visitor.agent.get(path).expect(200);
        seen.push(...handles(page.body.items));
        cursor = page.body.nextCursor;
        pages += 1;
      } while (cursor !== null);

      expect(pages).toBe(3);
      expect(seen).toHaveLength(5);
      expect(new Set(seen)).toEqual(
        new Set([
          'usrsearch_admin',
          'usrsearch_alice',
          'usrsearch_bruno',
          'usrsearch_chloe',
          'usrsearch_reporter',
        ]),
      );
    });

    it('refuses a bad cursor, a limit above 50 and an unknown status with 400', async () => {
      await visitor.agent.get(`${ACCOUNTS}?cursor=garbage`).expect(400);
      await visitor.agent.get(`${ACCOUNTS}?limit=51`).expect(400);
      await visitor.agent.get(`${ACCOUNTS}?status=banned`).expect(400);
    });

    it('shows an account, with its e-mail masked and no history yet', async () => {
      const view = await visitor.agent.get(`${ACCOUNTS}/${alice.id}`).expect(200);

      expect(view.body).toMatchObject({
        id: alice.id,
        handle: 'usrsearch_alice',
        status: 'active',
        role: 'user',
        maskedEmail: 'u***@e***.test',
        suspensionReason: null,
        statusChangedAt: null,
        lastLoginAt: null,
        activeSessionCount: 0,
        reports: { total: 0, open: 0 },
        moderatedContentCount: 0,
        history: [],
      });
      expect(view.text).not.toContain(alice.email);
    });

    it('shows the reason and the date of a suspension', async () => {
      const view = await visitor.agent.get(`${ACCOUNTS}/${bruno.id}`).expect(200);

      expect(view.body.status).toBe('suspended');
      expect(view.body.suspensionReason).toBe('Propos injurieux');
      expect(view.body.statusChangedAt).toEqual(expect.any(String));
    });

    it('counts the logins, sessions, reports and hidden content of an account', async () => {
      await prisma.loginEvent.create({
        data: {
          userId: chloe.id,
          result: 'failure',
          ipHash: 'f'.repeat(64),
          createdAt: new Date('2026-10-19T08:00:00Z'),
        },
      });
      await prisma.loginEvent.create({
        data: {
          userId: chloe.id,
          result: 'success',
          ipHash: 'f'.repeat(64),
          createdAt: new Date('2026-10-20T09:00:00Z'),
        },
      });
      await prisma.session.create({
        data: {
          id: 'usrsearch_session_active',
          userId: chloe.id,
          data: {},
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      await prisma.session.create({
        data: {
          id: 'usrsearch_session_expired',
          userId: chloe.id,
          data: {},
          expiresAt: new Date('2020-01-01'),
        },
      });
      const visible = await prisma.question.create({ data: { authorId: chloe.id, body: 'Visible' } });
      await prisma.question.create({
        data: { authorId: chloe.id, body: 'Hidden', moderationStatus: 'hidden' },
      });
      const reply = await prisma.reply.create({
        data: { questionId: visible.id, authorId: chloe.id, body: 'Removed', moderationStatus: 'removed' },
      });
      await prisma.report.create({
        data: { reporterId: reporter.id, questionId: visible.id, reason: 'spam' },
      });
      await prisma.report.create({
        data: { reporterId: reporter.id, replyId: reply.id, reason: 'harassment', status: 'resolved' },
      });

      const view = await visitor.agent.get(`${ACCOUNTS}/${chloe.id}`).expect(200);

      expect(view.body).toMatchObject({
        lastLoginAt: '2026-10-20T09:00:00.000Z',
        activeSessionCount: 1,
        reports: { total: 2, open: 1 },
        moderatedContentCount: 2,
      });
    });

    it('shows the audit entries about an administrator, newest first', async () => {
      const view = await visitor.agent.get(`${ACCOUNTS}/${admin.id}`).expect(200);

      const actions = view.body.history.map((entry: { action: string }) => entry.action);
      expect(actions).toEqual(expect.arrayContaining(['auth.admin_login', 'auth.mfa_enrol']));
      expect(view.body.history.every((entry: { targetId: string }) => entry.targetId === admin.id)).toBe(
        true,
      );
    });

    it('answers 404 to an unknown account, and 400 to an id that is not one', async () => {
      await visitor.agent.get(`${ACCOUNTS}/${UNKNOWN_ID}`).expect(404);
      await visitor.agent.get(`${ACCOUNTS}/not-a-uuid`).expect(400);
    });
  });
});

function handles(items: { handle: string }[]): string[] {
  return items.map((item) => item.handle).sort();
}
