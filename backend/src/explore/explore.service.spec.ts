import type { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import { encodeCursor } from '../feed/feed-cursor';
import type { QuestionsRepository } from '../questions/questions.repository';
import { ExploreRepository } from './explore.repository';
import { ExploreService } from './explore.service';

const VIEWER: SessionUser = {
  id: '11111111-1111-4111-8111-111111111111',
  handle: 'alice',
  displayName: 'Alice',
  role: 'user',
  status: 'active',
};

const QUESTION_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';

/** A question row as the repository returns it, with its author and hashtags. */
function row(id: string, createdAt: Date) {
  return {
    id,
    body: `Question ${id}`,
    createdAt,
    likeCount: 0,
    dislikeCount: 0,
    yCount: 3,
    replyCount: 0,
    conversationOpenedAt: null,
    deletedAt: null,
    moderationStatus: 'visible' as const,
    moderatedAt: null,
    authorId: 'author-1',
    author: { handle: 'bob', displayName: 'Bob' },
    hashtags: [{ hashtag: { name: 'tests' }, createdAt, questionId: id, hashtagId: 'hashtag-1' }],
  };
}

type Explore = jest.Mocked<
  Pick<
    ExploreRepository,
    | 'trendingHashtags'
    | 'popularQuestionIds'
    | 'findVisibleQuestions'
    | 'findHashtagPage'
    | 'searchQuestions'
    | 'searchHashtags'
    | 'searchAccounts'
    | 'suggestedAccounts'
  >
>;
type Questions = jest.Mocked<
  Pick<QuestionsRepository, 'findViewerReactions' | 'findFollowedAuthorIds' | 'findViewerSaved'>
>;

function setup() {
  const explore: Explore = {
    trendingHashtags: jest.fn().mockResolvedValue([]),
    popularQuestionIds: jest.fn().mockResolvedValue([]),
    findVisibleQuestions: jest.fn().mockResolvedValue([]),
    findHashtagPage: jest.fn().mockResolvedValue([]),
    searchQuestions: jest.fn().mockResolvedValue([]),
    searchHashtags: jest.fn().mockResolvedValue([]),
    searchAccounts: jest.fn().mockResolvedValue([]),
    suggestedAccounts: jest.fn().mockResolvedValue([]),
  };
  const questions: Questions = {
    findViewerReactions: jest.fn().mockResolvedValue([]),
    findFollowedAuthorIds: jest.fn().mockResolvedValue([]),
    findViewerSaved: jest.fn().mockResolvedValue([]),
  };
  const config = { getOrThrow: jest.fn().mockReturnValue(50) } as unknown as ConfigService;

  return { service: new ExploreService(explore as never, questions as never, config), explore, questions };
}

describe('ExploreService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-27T12:00:00Z')));
  afterEach(() => jest.useRealTimers());

  it('reads the trends over the last 24 hours', async () => {
    const { service, explore } = setup();

    await service.trends(VIEWER);

    expect(explore.trendingHashtags).toHaveBeenCalledWith(VIEWER.id, new Date('2026-10-26T12:00:00Z'), 10);
  });

  it('returns the popular questions in the ranking order, not the database order', async () => {
    const { service, explore, questions } = setup();
    explore.popularQuestionIds.mockResolvedValue([QUESTION_ID, OTHER_ID]);
    explore.findVisibleQuestions.mockResolvedValue([
      row(OTHER_ID, new Date('2026-10-27T10:00:00Z')),
      row(QUESTION_ID, new Date('2026-10-27T09:00:00Z')),
    ]);
    questions.findViewerReactions.mockResolvedValue([{ questionId: QUESTION_ID, kind: 'like' }]);

    const { questions: views } = await service.popular(VIEWER);

    expect(views.map((view) => view.id)).toEqual([QUESTION_ID, OTHER_ID]);
    expect(views[0]?.viewerReactions).toEqual(['like']);
    expect(views[1]?.viewerReactions).toEqual([]);
  });

  it('marks the authors the viewer follows and the questions the viewer saved', async () => {
    const { service, explore, questions } = setup();
    explore.popularQuestionIds.mockResolvedValue([QUESTION_ID]);
    explore.findVisibleQuestions.mockResolvedValue([row(QUESTION_ID, new Date('2026-10-27T09:00:00Z'))]);
    questions.findFollowedAuthorIds.mockResolvedValue([{ followeeId: 'author-1' }]);
    questions.findViewerSaved.mockResolvedValue([{ questionId: QUESTION_ID }]);

    const { questions: views } = await service.popular(VIEWER);

    expect(views[0]?.author.viewerFollows).toBe(true);
    expect(views[0]?.viewerSaved).toBe(true);
  });

  it('searches with the hashtag text in lowercase and returns the three groups', async () => {
    const { service, explore } = setup();
    explore.searchHashtags.mockResolvedValue([{ name: 'tests' }]);
    explore.searchAccounts.mockResolvedValue([{ handle: 'bob', displayName: 'Bob' }]);

    const result = await service.search(VIEWER, 'Tes');

    expect(explore.searchHashtags).toHaveBeenCalledWith('tes', 5);
    expect(explore.searchQuestions).toHaveBeenCalledWith(VIEWER.id, 'Tes', 10);
    expect(result.hashtags).toEqual([{ name: 'tests' }]);
    expect(result.accounts).toEqual([{ handle: 'bob', displayName: 'Bob' }]);
  });

  it('pages a hashtag with a cursor built from the last row of the page', async () => {
    const { service, explore } = setup();
    const first = row(QUESTION_ID, new Date('2026-10-27T09:00:00Z'));
    const second = row(OTHER_ID, new Date('2026-10-27T08:00:00Z'));
    explore.findHashtagPage.mockResolvedValue([first, second]);

    const page = await service.hashtagPage(VIEWER, 'Tests', undefined, 1);

    expect(explore.findHashtagPage).toHaveBeenCalledWith(VIEWER.id, 'tests', null, 2);
    expect(page.questions.map((question) => question.id)).toEqual([QUESTION_ID]);
    expect(page.nextCursor).toBe(encodeCursor(first));
  });

  it('gives no next cursor on the last page of a hashtag', async () => {
    const { service, explore } = setup();
    explore.findHashtagPage.mockResolvedValue([row(QUESTION_ID, new Date('2026-10-27T09:00:00Z'))]);

    const page = await service.hashtagPage(VIEWER, 'tests', undefined, 20);

    expect(page.nextCursor).toBeNull();
  });

  it('returns the suggested accounts from the repository', async () => {
    const { service, explore } = setup();
    explore.suggestedAccounts.mockResolvedValue([{ id: OTHER_ID, handle: 'carol', displayName: 'Carol' }]);

    const result = await service.suggestions(VIEWER);

    expect(explore.suggestedAccounts).toHaveBeenCalledWith(VIEWER.id, new Date('2026-10-26T12:00:00Z'), 5);
    expect(result.accounts).toEqual([{ id: OTHER_ID, handle: 'carol', displayName: 'Carol' }]);
  });
});
