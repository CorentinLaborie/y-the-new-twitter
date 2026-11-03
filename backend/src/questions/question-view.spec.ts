import { toQuestionView } from './question-view';

const row = {
  id: 'question-id',
  body: 'Une question',
  createdAt: new Date('2026-10-27T10:00:00.000Z'),
  likeCount: 0,
  dislikeCount: 0,
  yCount: 0,
  replyCount: 0,
  conversationOpenedAt: null,
  author: { handle: 'alice', displayName: 'Alice', avatarUrl: '/avatars/alice.jpg' },
  hashtags: [],
} as never;

describe('toQuestionView author (photo everywhere, DEC-351)', () => {
  it('gives the address of the author photo', () => {
    const view = toQuestionView(row, 50, [], false, false);

    expect(view.author).toEqual({
      handle: 'alice',
      displayName: 'Alice',
      avatarUrl: '/avatars/alice.jpg',
      viewerFollows: false,
    });
  });

  it('gives null when the author has no photo, so the initial is shown', () => {
    const view = toQuestionView(
      { ...(row as object), author: { handle: 'alice', displayName: 'Alice', avatarUrl: null } } as never,
      50,
      [],
      false,
      false,
    );

    expect(view.author.avatarUrl).toBeNull();
  });
});
