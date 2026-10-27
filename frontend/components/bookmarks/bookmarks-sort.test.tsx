import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBookmarkPage } from '@/lib/bookmarks-api';
import type { FeedQuestion } from '@/lib/feed-api';
import { BookmarksScreen } from './bookmarks-screen';

vi.mock('@/lib/bookmarks-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bookmarks-api')>();
  return { ...actual, fetchBookmarkPage: vi.fn(), unsaveQuestion: vi.fn(), saveQuestion: vi.fn() };
});

function question(id: string, text: string): FeedQuestion {
  return {
    id,
    text,
    hashtags: [],
    createdAt: '2026-10-20T10:00:00.000Z',
    author: { handle: 'alice', displayName: 'Alice', viewerFollows: false },
    counters: { like: 0, dislike: 0, y: 0, reply: 0 },
    yThreshold: 50,
    conversationOpen: false,
    viewerReactions: [],
    viewerSaved: true,
  };
}

const OK = (body: unknown) => ({ ok: true, status: 200, body }) as never;

describe('BookmarksScreen sort (DEC-350)', () => {
  beforeEach(() => {
    vi.mocked(fetchBookmarkPage).mockReset();
  });

  it('offers the two orders and lists again by the question date when it is chosen', async () => {
    vi.mocked(fetchBookmarkPage).mockResolvedValue(OK({ questions: [question('q-1', 'Vélo')], nextCursor: null, total: 1 }));
    render(<BookmarksScreen viewerHandle="corentin" viewerSuspended={false} />);
    await screen.findByText('Vélo');

    const select = screen.getByRole('combobox', { name: 'Trier par' });
    expect(screen.getByRole('option', { name: 'Date d’enregistrement' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Date de la question' })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'question' } });

    await waitFor(() => expect(fetchBookmarkPage).toHaveBeenLastCalledWith({ search: '', sort: 'question' }));
  });

  it('shows the handle and the total in the header', async () => {
    vi.mocked(fetchBookmarkPage).mockResolvedValue(OK({ questions: [question('q-1', 'Vélo')], nextCursor: null, total: 3 }));
    render(<BookmarksScreen viewerHandle="corentin" viewerSuspended={false} />);

    expect(await screen.findByText('@corentin · 3 questions enregistrées')).toBeInTheDocument();
  });
});
