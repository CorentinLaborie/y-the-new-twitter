import { toReplyView } from './reply-view';

const row = {
  id: 'reply-id',
  questionId: 'question-id',
  body: '@robert44 et @ghost, merci',
  createdAt: new Date('2026-10-27T10:00:00.000Z'),
  author: { handle: 'alice', displayName: 'Alice' },
} as never;

describe('toReplyView mentionLinks (M3)', () => {
  it('lists only the mentions whose profile is linkable', () => {
    const view = toReplyView(row, { likeCount: 0, dislikeCount: 0 }, [], new Set(['robert44']));

    expect(view.mentionLinks).toEqual(['robert44']);
  });

  it('lists nothing when no mention is linkable', () => {
    const view = toReplyView(row, { likeCount: 0, dislikeCount: 0 }, [], new Set());

    expect(view.mentionLinks).toEqual([]);
  });
});
