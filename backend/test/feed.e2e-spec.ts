import { Controller, INestApplication, Param, Post, Req } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Request } from 'express';
import request from 'supertest';
import { Public } from '../src/auth/session/access.decorators';
import { configureApp } from '../src/configure-app';
import { runAsSuperuser, startMigratedPostgres } from './support/postgres';

/** Test-only route that starts a session for a user, through the real session middleware. */
@Controller('session-probe')
class SessionProbeController {
  @Public()
  @Post('login/:userId')
  login(@Req() req: Request, @Param('userId') userId: string): void {
    req.session.userId = userId;
  }
}

interface FeedItem {
  id: string;
  text: string;
  hashtags: string[];
  createdAt: string;
  author: { handle: string; displayName: string };
  counters: { like: number; dislike: number; y: number; reply: number };
  yThreshold: number;
  conversationOpen: boolean;
}

interface FeedPage {
  trending: FeedItem[];
  questions: FeedItem[];
  nextCursor: string | null;
}

describe('Feed "Pour vous" and "Abonnements" (e2e, B6, L3)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let token: string;
  let viewer: string;
  let writer: string;

  function sql(statement: string): Promise<string> {
    return runAsSuperuser(container, statement).then((result) => result.stdout.trim());
  }

  async function createUser(handle: string, status = 'active'): Promise<string> {
    const [id] = (
      await sql(
        `INSERT INTO users (handle, display_name, email, password_hash, status, terms_accepted_at, terms_version)
         VALUES ('${handle}', '${handle} Test', '${handle}@example.test', 'hash', '${status}', now(), '1.0')
         RETURNING id;`,
      )
    ).split('\n');
    return id;
  }

  /** The first page of a tab, or the page after `cursor`. */
  async function fetchPage(limit: number, cursor: string | null = null, tab = 'for-you'): Promise<FeedPage> {
    const cursorQuery = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
    const response = await agent.get(`/api/v1/feed?tab=${tab}&limit=${limit}${cursorQuery}`).expect(200);
    return response.body as FeedPage;
  }

  /** Every page of a tab, from the first one to the last. */
  async function walk(
    limit: number,
    tab = 'for-you',
  ): Promise<{ trending: FeedItem[]; questions: FeedItem[]; pages: FeedPage[] }> {
    const pages: FeedPage[] = [];
    let cursor: string | null = null;
    do {
      const page = await fetchPage(limit, cursor, tab);
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor !== null && pages.length < 20);

    return { trending: pages[0].trending, questions: pages.flatMap((page) => page.questions), pages };
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    process.env.DATABASE_URL = container.getConnectionUri();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [SessionProbeController],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();

    agent = request.agent(app.getHttpServer());
    const status = await agent.get('/api/v1/status').expect(200);
    const cookies = status.headers['set-cookie'] as unknown as string[];
    token = cookies
      .find((value) => value.startsWith('y_csrf='))!
      .split(';')[0]
      .split('=')[1];

    writer = await createUser('feed_writer');
    viewer = await createUser('feed_viewer');
    const blocked = await createUser('feed_blocked');
    const blocking = await createUser('feed_blocking');
    const suspended = await createUser('feed_suspended', 'suspended');

    // 45 recent questions, one minute apart. Two from 400 days ago: one is reacted to today (trending), one is not.
    await sql(
      `INSERT INTO questions (author_id, body, created_at)
       SELECT '${writer}', 'Question ' || g, now() - (g || ' minutes')::interval FROM generate_series(1, 45) g;`,
    );
    await sql(
      `INSERT INTO questions (author_id, body, created_at) VALUES ('${writer}', 'Très ancienne', now() - interval '400 days');`,
    );
    await sql(
      `INSERT INTO questions (author_id, body, created_at) VALUES ('${writer}', 'Ancienne sans réaction', now() - interval '400 days');`,
    );
    await sql(
      `INSERT INTO question_reactions (user_id, question_id, kind)
       SELECT '${viewer}', id, 'like' FROM questions WHERE body = 'Très ancienne';`,
    );
    await sql(`UPDATE questions SET like_count = 1 WHERE body = 'Très ancienne';`);
    // Not in the feed: hidden, deleted, from a suspended account, and from accounts that block the viewer or are blocked by it.
    await sql(
      `INSERT INTO questions (author_id, body, moderation_status) VALUES ('${writer}', 'Cachée', 'hidden');`,
    );
    await sql(
      `INSERT INTO questions (author_id, body, deleted_at) VALUES ('${writer}', 'Supprimée', now());`,
    );
    await sql(`INSERT INTO questions (author_id, body) VALUES ('${suspended}', 'Compte suspendu');`);
    await sql(`INSERT INTO questions (author_id, body) VALUES ('${blocked}', 'Bloquée');`);
    await sql(`INSERT INTO questions (author_id, body) VALUES ('${blocking}', 'Bloqueur');`);
    await sql(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${viewer}', '${blocked}');`);
    await sql(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${blocking}', '${viewer}');`);

    await agent.post(`/api/v1/session-probe/login/${viewer}`).set('x-csrf-token', token).expect(201);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('answers trending, questions and nextCursor; the first page lists by date, newest first, and the trending question is not repeated', async () => {
    const page = await fetchPage(3);

    expect(Object.keys(page).sort()).toEqual(['nextCursor', 'questions', 'trending']);
    expect(page.trending.map((question) => question.text)).toEqual(['Très ancienne']);
    expect(page.questions.map((question) => question.text)).toEqual([
      'Question 1',
      'Question 2',
      'Question 3',
    ]);
    expect(page.nextCursor).not.toBeNull();
    expect(Object.keys(page.questions[0]).sort()).toEqual([
      'author',
      'conversationOpen',
      'counters',
      'createdAt',
      'hashtags',
      'id',
      'removedByModeration',
      'text',
      'viewerReactions',
      'viewerSaved',
      'yThreshold',
    ]);
    expect(page.questions[0]).toMatchObject({
      author: { handle: 'feed_writer', displayName: 'feed_writer Test' },
      hashtags: [],
      counters: { like: 0, dislike: 0, y: 0, reply: 0 },
      yThreshold: 50,
      conversationOpen: false,
    });
    expect(page.trending[0]).toMatchObject({ counters: { like: 1, dislike: 0, y: 0, reply: 0 } });
  });

  it('pages the list without duplicates or gaps, and every visible question is in it (R12)', async () => {
    const { questions, pages } = await walk(20);
    const ids = questions.map((question) => question.id);
    const texts = questions.map((question) => question.text);

    expect(pages.length).toBe(3);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(47);
    expect(texts).toContain('Ancienne sans réaction');
    // Trending on the first screen, and in the list again on the last page: cursor pages are not filtered.
    expect(texts).toContain('Très ancienne');
    const dates = questions.map((question) => question.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(questions.at(-1)?.text).toMatch(/ancienne/);
  });

  it('keeps the cursor pages free of the trending block, and of the trending questions of the first page', async () => {
    const first = await fetchPage(20);
    const second = await fetchPage(20, first.nextCursor);

    expect(second.trending).toEqual([]);
    const firstIds = first.questions.map((question) => question.id);
    expect(second.questions.filter((question) => firstIds.includes(question.id))).toEqual([]);
    expect(first.trending.map((question) => question.id).filter((id) => firstIds.includes(id))).toEqual([]);
  });

  it('keeps every question once when a new one arrives between two pages', async () => {
    const first = await fetchPage(20);
    await sql(
      `INSERT INTO questions (author_id, body, created_at) VALUES ('${writer}', 'Arrivée entre deux pages', now() + interval '1 hour');`,
    );
    const second = await fetchPage(20, first.nextCursor);

    const firstIds = first.questions.map((question) => question.id);
    expect(second.questions.filter((question) => firstIds.includes(question.id))).toEqual([]);
    expect(second.questions).toHaveLength(20);
  });

  it('leaves out hidden, deleted, suspended and blocked-in-either-direction questions', async () => {
    const { trending, questions } = await walk(50);
    const texts = [...trending, ...questions].map((question) => question.text);

    expect(texts).not.toContain('Cachée');
    expect(texts).not.toContain('Supprimée');
    expect(texts).not.toContain('Compte suspendu');
    expect(texts).not.toContain('Bloquée');
    expect(texts).not.toContain('Bloqueur');
  });

  it('uses 20 as the default page size, and refuses an unknown tab, a bad limit or a bad cursor (400)', async () => {
    const defaults = await agent.get('/api/v1/feed?tab=for-you').expect(200);
    expect(defaults.body.questions).toHaveLength(20);

    await agent.get('/api/v1/feed?tab=trending').expect(400);
    await agent.get('/api/v1/feed').expect(400);
    await agent.get('/api/v1/feed?tab=for-you&limit=0').expect(400);
    await agent.get('/api/v1/feed?tab=for-you&limit=51').expect(400);
    await agent.get('/api/v1/feed?tab=for-you&cursor=n-importe-quoi').expect(400);
  });

  it('shows the Y count in counters.y, with yThreshold and conversationOpen on each question (B5)', async () => {
    await sql(`UPDATE questions SET y_count = 49 WHERE body = 'Question 2';`);

    const { questions } = await walk(50);
    const item = questions.find((candidate) => candidate.text === 'Question 2');

    expect(item).toMatchObject({ counters: { y: 49 }, yThreshold: 50, conversationOpen: false });
  });

  it("gives each question the viewer's own reaction in viewerReactions, and nothing for the others (R11)", async () => {
    const page = await fetchPage(50);
    const reacted = page.trending.find((candidate) => candidate.text === 'Très ancienne');
    const notReacted = page.questions.find((candidate) => candidate.text === 'Question 2');

    expect(reacted).toMatchObject({ viewerReactions: ['like'] });
    expect(notReacted).toMatchObject({ viewerReactions: [] });
  });

  it('shows at most 10 trending questions, the 10 most reacted in the last 24 hours, never a hidden one (DEC-046, DEC-091)', async () => {
    // Twelve old questions, each with one reaction today: with 'Très ancienne' they tie, so ten of the thirteen are trending.
    // A hidden old question with a reaction must not take one of the ten places.
    await sql(
      `INSERT INTO questions (author_id, body, created_at)
       SELECT '${writer}', 'Cap ' || g, now() - interval '400 days' FROM generate_series(1, 12) g;`,
    );
    await sql(
      `INSERT INTO questions (author_id, body, created_at, moderation_status)
       VALUES ('${writer}', 'Cap cachée', now() - interval '400 days', 'hidden');`,
    );
    await sql(
      `INSERT INTO question_reactions (user_id, question_id, kind)
       SELECT '${viewer}', id, 'dislike' FROM questions WHERE body LIKE 'Cap%';`,
    );

    const first = await fetchPage(50);
    const trendingTexts = first.trending.map((question) => question.text);
    const listedIds = first.questions.map((question) => question.id);

    expect(trendingTexts).toHaveLength(10);
    expect(trendingTexts.every((text) => text === 'Très ancienne' || text.startsWith('Cap '))).toBe(true);
    expect(trendingTexts).not.toContain('Cap cachée');
    expect(first.trending.some((question) => listedIds.includes(question.id))).toBe(false);
  });

  it('lists on "Abonnements" only the questions of the followed accounts, newest first, with no trending block', async () => {
    const stranger = await createUser('feed_stranger');
    await sql(`INSERT INTO questions (author_id, body) VALUES ('${stranger}', 'Inconnue');`);
    await sql(`INSERT INTO follows (follower_id, followee_id) VALUES ('${viewer}', '${writer}');`);

    const { questions, pages } = await walk(20, 'following');
    const texts = questions.map((question) => question.text);

    expect(pages.every((page) => page.trending.length === 0)).toBe(true);
    expect(texts).toContain('Question 1');
    expect(texts).not.toContain('Inconnue');
    expect(questions.every((question) => question.author.handle === 'feed_writer')).toBe(true);
    const dates = questions.map((question) => question.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(questions.find((question) => question.text === 'Très ancienne')).toMatchObject({
      viewerReactions: ['like'],
    });
  });

  it('pages "Abonnements" without duplicates or gaps, with the same questions as the followed author on "Pour vous"', async () => {
    const following = await walk(7, 'following');
    const everyone = await walk(50);
    // The trending block of "Pour vous" can hold questions of this author: they count too. The first page leaves them
    // out of the list, but a later page can show one again, so the ids are de-duplicated before the comparison. Its
    // order is by reactions, so the two lists are compared as sets. The order by date is checked by the test above.
    const writerIds = [
      ...new Set(
        [...everyone.trending, ...everyone.questions]
          .filter((question) => question.author.handle === 'feed_writer')
          .map((question) => question.id),
      ),
    ].sort();
    const followingIds = following.questions.map((question) => question.id);

    expect(following.pages.length).toBeGreaterThan(1);
    expect(new Set(followingIds).size).toBe(followingIds.length);
    expect([...followingIds].sort()).toEqual(writerIds);
  });

  it('leaves out of "Abonnements" the hidden, deleted, suspended and blocked-in-either-direction questions, even when followed', async () => {
    await sql(
      `INSERT INTO follows (follower_id, followee_id)
       SELECT '${viewer}', id FROM users WHERE handle IN ('feed_suspended', 'feed_blocked', 'feed_blocking');`,
    );

    const { trending, questions } = await walk(50, 'following');
    const texts = [...trending, ...questions].map((question) => question.text);

    expect(texts).toContain('Question 1');
    expect(texts).not.toContain('Cachée');
    expect(texts).not.toContain('Supprimée');
    expect(texts).not.toContain('Compte suspendu');
    expect(texts).not.toContain('Bloquée');
    expect(texts).not.toContain('Bloqueur');
  });

  it('leaves out of "Abonnements" the viewer\'s own questions', async () => {
    await sql(`INSERT INTO questions (author_id, body) VALUES ('${viewer}', 'Question du viewer');`);

    const { questions } = await walk(50, 'following');

    expect(questions.map((question) => question.text)).not.toContain('Question du viewer');
  });
});
