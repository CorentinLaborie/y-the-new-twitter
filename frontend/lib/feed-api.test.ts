import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteReaction, fetchFeedPage, putReaction } from './feed-api';

describe('reaction calls', () => {
  beforeEach(() => {
    document.cookie = 'y_csrf=csrf-unit';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps the PUT answer: the counters, the Y threshold and the open conversation come along', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          questionId: 'q1',
          counters: { like: 10, dislike: 2, y: 50 },
          viewerReactions: ['y'],
          yThreshold: 50,
          conversationOpen: true,
        }),
      ),
    );

    const result = await putReaction('q1', 'y');

    expect(result).toEqual({
      ok: true,
      status: 200,
      body: {
        counters: { like: 10, dislike: 2, y: 50 },
        viewerReactions: ['y'],
        yThreshold: 50,
        conversationOpen: true,
      },
    });
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(init?.method).toBe('PUT');
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('csrf-unit');
  });

  it('answers an empty state for a DELETE that gets 204, so the page keeps its own update', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    const result = await deleteReaction('q1', 'like');

    expect(result).toEqual({ ok: true, status: 204, body: {} });
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.method).toBe('DELETE');
  });
});

describe('the protected feed calls', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the browser to the session-expired login page when the feed answers 401', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { replace });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ title: 'Non authentifié', detail: 'Session absente.' }, { status: 401 }),
      ),
    );

    const result = await fetchFeedPage();

    expect(result).toMatchObject({ ok: false, problem: { status: 401 } });
    expect(replace).toHaveBeenCalledWith('/login?reason=session-expired');
  });
});
