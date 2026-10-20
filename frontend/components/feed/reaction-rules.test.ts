import { describe, expect, it } from 'vitest';
import type { ReactionState } from '@/lib/feed-api';
import { applyReaction, withServerState } from './reaction-rules';

const NONE: ReactionState = {
  counters: { like: 10, dislike: 2, y: 49 },
  yThreshold: 50,
  conversationOpen: false,
  viewerReactions: [],
};

describe('applyReaction', () => {
  it('sets a reaction the viewer does not have yet, with a PUT', () => {
    const { next, request } = applyReaction(NONE, 'like');

    expect(request).toBe('put');
    expect(next.viewerReactions).toEqual(['like']);
    expect(next.counters).toEqual({ like: 11, dislike: 2, y: 49 });
  });

  it('replaces the previous reaction: the old count goes down, the new one goes up', () => {
    const liked: ReactionState = {
      ...NONE,
      counters: { like: 11, dislike: 2, y: 49 },
      viewerReactions: ['like'],
    };

    const { next, request } = applyReaction(liked, 'dislike');

    expect(request).toBe('put');
    expect(next.viewerReactions).toEqual(['dislike']);
    expect(next.counters).toEqual({ like: 10, dislike: 3, y: 49 });
  });

  it('removes the reaction when the active kind is clicked again, with a DELETE', () => {
    const liked: ReactionState = {
      ...NONE,
      counters: { like: 11, dislike: 2, y: 49 },
      viewerReactions: ['like'],
    };

    const { next, request } = applyReaction(liked, 'like');

    expect(request).toBe('delete');
    expect(next.viewerReactions).toEqual([]);
    expect(next.counters.like).toBe(10);
  });

  it('moves the Y count (counters.y) when a Y reaction is set, replaced or removed', () => {
    expect(applyReaction(NONE, 'y').next.counters.y).toBe(50);

    const withY: ReactionState = {
      ...NONE,
      counters: { like: 10, dislike: 2, y: 50 },
      viewerReactions: ['y'],
    };
    expect(applyReaction(withY, 'like').next.counters.y).toBe(49);
    expect(applyReaction(withY, 'y').next.counters.y).toBe(49);
  });

  it('never takes a count below zero', () => {
    const empty: ReactionState = {
      ...NONE,
      counters: { like: 0, dislike: 0, y: 0 },
      viewerReactions: ['dislike'],
    };

    expect(applyReaction(empty, 'dislike').next.counters.dislike).toBe(0);
    expect(applyReaction(empty, 'like').next.counters.dislike).toBe(0);
  });

  it('does not change the state it is given, so that the previous state can be restored', () => {
    const before = structuredClone(NONE);

    applyReaction(NONE, 'y');

    expect(NONE).toEqual(before);
  });
});

describe('withServerState', () => {
  it('takes the server state when the answer has one', () => {
    const answer = {
      counters: { like: 3, dislike: 0, y: 50 },
      yThreshold: 50,
      conversationOpen: true,
      viewerReactions: ['y' as const],
    };

    expect(withServerState(NONE, answer)).toEqual(answer);
  });

  it('keeps the optimistic state when the answer has no body (204)', () => {
    const optimistic = { ...NONE, viewerReactions: ['like' as const] };

    expect(withServerState(optimistic, {})).toEqual(optimistic);
  });
});
