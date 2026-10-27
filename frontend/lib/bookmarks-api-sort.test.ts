import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBookmarkPage } from './bookmarks-api';

/** The path and query of the first fetch call. */
function firstPath(): string {
  const url = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));
  return `${url.pathname}${url.search}`;
}

describe('fetchBookmarkPage sort (DEC-350)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ questions: [], nextCursor: null, total: 0 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends no sort parameter for the save order, the default', async () => {
    await fetchBookmarkPage({ search: '' });

    expect(firstPath()).toBe('/api/v1/bookmarks');
  });

  it('sends sort=question for the order by the question date', async () => {
    await fetchBookmarkPage({ search: '', sort: 'question', cursor: 'c1' });

    expect(firstPath()).toBe('/api/v1/bookmarks?cursor=c1&sort=question');
  });
});
