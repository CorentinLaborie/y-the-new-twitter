import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBookmarkPage, unsaveQuestion } from '@/lib/bookmarks-api';
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

describe('BookmarksScreen (L4)', () => {
  beforeEach(() => {
    vi.mocked(fetchBookmarkPage).mockReset();
    vi.mocked(unsaveQuestion).mockReset();
  });

  it('shows the loading state, then the saved questions in the order they come', async () => {
    vi.mocked(fetchBookmarkPage).mockResolvedValue(
      OK({ questions: [question('q-1', 'Première'), question('q-2', 'Seconde')], nextCursor: null }),
    );
    render(<BookmarksScreen viewerHandle="viewer" viewerSuspended={false} />);

    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(await screen.findByText('Première')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Première');
  });

  it('shows the empty state when nothing is saved', async () => {
    vi.mocked(fetchBookmarkPage).mockResolvedValue(OK({ questions: [], nextCursor: null }));
    render(<BookmarksScreen viewerHandle="viewer" viewerSuspended={false} />);

    expect(await screen.findByText('Aucune question enregistrée')).toBeInTheDocument();
    expect(screen.getByText('Enregistrez une question pour la retrouver ici.')).toBeInTheDocument();
  });

  it('shows the error state and loads again on "Réessayer"', async () => {
    vi.mocked(fetchBookmarkPage)
      .mockResolvedValueOnce({ ok: false, problem: { status: 500, title: 'x', detail: 'x' } } as never)
      .mockResolvedValueOnce(OK({ questions: [question('q-1', 'Revenue')], nextCursor: null }));
    render(<BookmarksScreen viewerHandle="viewer" viewerSuspended={false} />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Revenue')).toBeInTheDocument();
  });

  it('removes a question from the list at once when it is unsaved', async () => {
    vi.mocked(fetchBookmarkPage).mockResolvedValue(
      OK({ questions: [question('q-1', 'Retirée'), question('q-2', 'Gardée')], nextCursor: null }),
    );
    vi.mocked(unsaveQuestion).mockResolvedValue({ ok: true, status: 204, body: undefined } as never);
    render(<BookmarksScreen viewerHandle="viewer" viewerSuspended={false} />);
    await screen.findByText('Retirée');

    const [first] = screen.getAllByRole('button', { name: 'Retirer des signets' });
    fireEvent.click(first);

    await waitFor(() => expect(screen.queryByText('Retirée')).not.toBeInTheDocument());
    expect(screen.getByText('Gardée')).toBeInTheDocument();
    expect(unsaveQuestion).toHaveBeenCalledWith('q-1');
  });

  it('loads the next page with "Voir plus" and adds it after the first one', async () => {
    vi.mocked(fetchBookmarkPage)
      .mockResolvedValueOnce(OK({ questions: [question('q-1', 'Page un')], nextCursor: 'c1' }))
      .mockResolvedValueOnce(OK({ questions: [question('q-2', 'Page deux')], nextCursor: null }));
    render(<BookmarksScreen viewerHandle="viewer" viewerSuspended={false} />);
    await screen.findByText('Page un');

    fireEvent.click(screen.getByRole('button', { name: 'Voir plus' }));

    expect(await screen.findByText('Page deux')).toBeInTheDocument();
    expect(fetchBookmarkPage).toHaveBeenLastCalledWith({ cursor: 'c1', search: '', sort: 'saved' });
  });

  it('shows the total of every saved question, and searches only when the search is submitted (L4)', async () => {
    vi.mocked(fetchBookmarkPage)
      .mockResolvedValueOnce(OK({ questions: [question('q-1', 'Vélo')], nextCursor: null, total: 4 }))
      .mockResolvedValueOnce(OK({ questions: [], nextCursor: null, total: 4 }));
    render(<BookmarksScreen viewerHandle="bob" viewerSuspended={false} />);

    expect(await screen.findByText(/4 questions enregistrées/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Rechercher dans vos signets'), { target: { value: '  pain ' } });
    expect(fetchBookmarkPage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(await screen.findByRole('heading', { name: 'Aucune question ne correspond' })).toBeInTheDocument();
    expect(fetchBookmarkPage).toHaveBeenLastCalledWith({ search: 'pain', sort: 'saved' });
    expect(screen.queryByRole('button', { name: 'Voir plus' })).not.toBeInTheDocument();
  });
});
