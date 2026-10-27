import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bookmarkFailureMessage, fetchBookmarkPage, saveQuestion, unsaveQuestion } from './bookmarks-api';
import { protectedApiRequest } from '@/lib/session-expired';

vi.mock('@/lib/session-expired', () => ({ protectedApiRequest: vi.fn() }));

describe('bookmarks-api (L4)', () => {
  beforeEach(() => {
    vi.mocked(protectedApiRequest).mockReset();
  });

  it('saves with PUT on the question path', async () => {
    await saveQuestion('q-1');
    expect(protectedApiRequest).toHaveBeenCalledWith('PUT', '/questions/q-1/bookmark');
  });

  it('removes with DELETE on the same path', async () => {
    await unsaveQuestion('q-1');
    expect(protectedApiRequest).toHaveBeenCalledWith('DELETE', '/questions/q-1/bookmark');
  });

  it('reads the first page with no cursor, and the next one with the cursor encoded', async () => {
    await fetchBookmarkPage();
    expect(protectedApiRequest).toHaveBeenLastCalledWith('GET', '/bookmarks');

    await fetchBookmarkPage({ cursor: 'abc+/=' });
    expect(protectedApiRequest).toHaveBeenLastCalledWith('GET', '/bookmarks?cursor=abc%2B%2F%3D');
  });

  it('sends the search trimmed and encoded, and leaves it out when it is blank (L4)', async () => {
    await fetchBookmarkPage({ search: '  vélo ' });
    expect(protectedApiRequest).toHaveBeenLastCalledWith('GET', '/bookmarks?q=v%C3%A9lo');

    await fetchBookmarkPage({ cursor: 'c1', search: '   ' });
    expect(protectedApiRequest).toHaveBeenLastCalledWith('GET', '/bookmarks?cursor=c1');
  });

  it('gives the status message when the code is unknown: 404 unavailable, 403 account not active', () => {
    const problem = (status: number) => ({ status, title: 'x', detail: 'x' });
    expect(bookmarkFailureMessage(problem(404), true)).toBe('Cette question n’est plus disponible.');
    expect(bookmarkFailureMessage(problem(403), false)).toContain('pas actif');
    expect(bookmarkFailureMessage(problem(500), false)).toBe(
      'La question n’a pas pu être retirée des signets. Réessayez.',
    );
  });
});
