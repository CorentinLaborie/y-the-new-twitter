import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import { encodeKeysetCursor } from '../common/pagination/keyset-cursor';
import type { QuestionsRepository } from '../questions/questions.repository';
import type { BookmarksRepository } from './bookmarks.repository';
import { BookmarksService } from './bookmarks.service';

const VIEWER = { id: 'viewer-1', handle: 'viewer', displayName: 'Viewer' } as SessionUser;
const QUESTION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const THIRD_ID = '33333333-3333-4333-8333-333333333333';

/** A bookmark row as the repository returns it, with its question and author. */
function bookmarkRow(questionId: string, savedAt: string, authorId = 'author-1') {
  return {
    questionId,
    createdAt: new Date(savedAt),
    question: {
      id: questionId,
      authorId,
      body: `Question ${questionId}`,
      createdAt: new Date('2026-10-20T10:00:00Z'),
      likeCount: 0,
      dislikeCount: 0,
      yCount: 0,
      replyCount: 0,
      conversationOpenedAt: null,
      author: { handle: 'alice', displayName: 'Alice' },
      hashtags: [],
    },
  };
}

describe('BookmarksService (L4)', () => {
  let bookmarks: jest.Mocked<
    Pick<BookmarksRepository, 'findVisibleQuestion' | 'createBookmark' | 'deleteBookmark' | 'findPage' | 'countVisible'>
  >;
  let questions: jest.Mocked<Pick<QuestionsRepository, 'findViewerReactions' | 'findFollowedAuthorIds'>>;
  let config: { getOrThrow: jest.Mock };
  let service: BookmarksService;

  beforeEach(() => {
    bookmarks = {
      findVisibleQuestion: jest.fn().mockResolvedValue({ id: QUESTION_ID }),
      createBookmark: jest.fn().mockResolvedValue(true),
      deleteBookmark: jest.fn().mockResolvedValue({ count: 1 }),
      findPage: jest.fn().mockResolvedValue([]),
      countVisible: jest.fn().mockResolvedValue(0),
    } as never;
    questions = {
      findViewerReactions: jest.fn().mockResolvedValue([]),
      findFollowedAuthorIds: jest.fn().mockResolvedValue([]),
    } as never;
    config = { getOrThrow: jest.fn().mockReturnValue(50) };
    service = new BookmarksService(
      bookmarks as unknown as BookmarksRepository,
      questions as unknown as QuestionsRepository,
      config as unknown as ConfigService,
    );
  });

  it('saves a visible question and answers the state', async () => {
    await expect(service.save(VIEWER, QUESTION_ID)).resolves.toEqual({
      questionId: QUESTION_ID,
      saved: true,
    });

    expect(bookmarks.findVisibleQuestion).toHaveBeenCalledWith('viewer-1', QUESTION_ID);
    expect(bookmarks.createBookmark).toHaveBeenCalledWith('viewer-1', QUESTION_ID);
  });

  it('refuses to save a question the viewer cannot see (404), and stores nothing', async () => {
    bookmarks.findVisibleQuestion.mockResolvedValue(null);

    await expect(service.save(VIEWER, QUESTION_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(bookmarks.createBookmark).not.toHaveBeenCalled();
  });

  it('saving again changes nothing, and still answers saved (idempotence)', async () => {
    bookmarks.createBookmark.mockResolvedValue(false);

    await expect(service.save(VIEWER, QUESTION_ID)).resolves.toEqual({
      questionId: QUESTION_ID,
      saved: true,
    });
  });

  it('removes the saved row of the viewer, and does nothing when there was none', async () => {
    bookmarks.deleteBookmark.mockResolvedValue({ count: 0 });

    await expect(service.remove(VIEWER, QUESTION_ID)).resolves.toBeUndefined();
    expect(bookmarks.deleteBookmark).toHaveBeenCalledWith('viewer-1', QUESTION_ID);
  });

  it('lists the saved questions with the viewer state, and marks each one as saved', async () => {
    bookmarks.findPage.mockResolvedValue([bookmarkRow(QUESTION_ID, '2026-10-22T10:00:00Z')] as never);
    questions.findViewerReactions.mockResolvedValue([{ questionId: QUESTION_ID, kind: 'like' }] as never);
    questions.findFollowedAuthorIds.mockResolvedValue([{ followeeId: 'author-1' }] as never);

    const page = await service.list(VIEWER, { limit: 20 } as never);

    expect(page.nextCursor).toBeNull();
    expect(page.questions).toHaveLength(1);
    expect(page.questions[0]).toMatchObject({
      id: QUESTION_ID,
      viewerReactions: ['like'],
      viewerSaved: true,
      author: { handle: 'alice', viewerFollows: true },
    });
  });

  it('pages by the save position: one more row than the limit gives a cursor on the last shown row', async () => {
    bookmarks.findPage.mockResolvedValue([
      bookmarkRow(QUESTION_ID, '2026-10-22T10:00:00Z'),
      bookmarkRow(OTHER_ID, '2026-10-21T10:00:00Z'),
      bookmarkRow(THIRD_ID, '2026-10-20T10:00:00Z'),
    ] as never);

    const page = await service.list(VIEWER, { limit: 2 } as never);

    expect(page.questions.map((question) => question.id)).toEqual([QUESTION_ID, OTHER_ID]);
    expect(page.nextCursor).toBe(
      encodeKeysetCursor({ createdAt: new Date('2026-10-21T10:00:00Z'), id: OTHER_ID }),
    );
  });

  it('reads the page after the cursor it is given', async () => {
    const cursor = encodeKeysetCursor({ createdAt: new Date('2026-10-21T10:00:00Z'), id: OTHER_ID });

    await service.list(VIEWER, { limit: 20, cursor } as never);

    expect(bookmarks.findPage).toHaveBeenCalledWith(
      'viewer-1',
      { createdAt: new Date('2026-10-21T10:00:00Z'), id: OTHER_ID },
      21,
      undefined,
    );
  });

  it('passes the search to the repository, and keeps the total of every saved question', async () => {
    bookmarks.findPage.mockResolvedValue([bookmarkRow(QUESTION_ID, '2026-10-22T10:00:00Z')] as never);
    bookmarks.countVisible.mockResolvedValue(12);

    const page = await service.list(VIEWER, { limit: 20, q: 'alice' } as never);

    expect(bookmarks.findPage).toHaveBeenCalledWith('viewer-1', undefined, 21, 'alice');
    expect(bookmarks.countVisible).toHaveBeenCalledWith('viewer-1');
    expect(page.total).toBe(12);
  });
});
