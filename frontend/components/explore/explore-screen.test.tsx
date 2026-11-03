import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPopular, fetchSuggestions, fetchTrends, search } from '@/lib/explore-api';
import type { FeedQuestion } from '@/lib/feed-api';
import { ExploreScreen } from './explore-screen';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

vi.mock('@/lib/explore-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/explore-api')>();
  return {
    ...actual,
    fetchTrends: vi.fn(),
    fetchPopular: vi.fn(),
    fetchSuggestions: vi.fn(),
    search: vi.fn(),
  };
});

function question(id: string, text: string): FeedQuestion {
  return {
    id,
    text,
    hashtags: ['tests'],
    createdAt: '2026-10-27T10:00:00.000Z',
    author: { handle: 'alice', displayName: 'Alice', avatarUrl: null, viewerFollows: false },
    counters: { like: 0, dislike: 0, y: 0, reply: 0 },
    yThreshold: 50,
    conversationOpen: false,
    viewerReactions: [],
    viewerSaved: false,
  };
}

const OK = (body: unknown) => ({ ok: true, status: 200, body }) as never;
const EMPTY_SEARCH = { questions: [], hashtags: [], accounts: [] };

describe('ExploreScreen (M4)', () => {
  beforeEach(() => {
    replace.mockReset();
    vi.mocked(fetchTrends).mockResolvedValue(OK({ hashtags: [{ name: 'tests', reactions: 3 }] }));
    vi.mocked(fetchPopular).mockResolvedValue(OK({ questions: [question('q-1', 'Question populaire')] }));
    vi.mocked(fetchSuggestions).mockResolvedValue(
      OK({ accounts: [{ id: 'a-1', handle: 'carol', displayName: 'Carol' }] }),
    );
    vi.mocked(search).mockResolvedValue(OK(EMPTY_SEARCH));
  });

  it('shows the trends with their « sur 24 h » count, the popular questions and the suggested accounts', async () => {
    render(<ExploreScreen initialQuery="" viewer={{ handle: 'viewer', suspended: false }} />);

    const trends = within(await screen.findByRole('region', { name: 'Tendances' }));
    expect(trends.getByText('#tests')).toBeInTheDocument();
    expect(trends.getByText('3 réactions sur 24 h')).toBeInTheDocument();
    expect(await screen.findByText('Question populaire')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Questions populaires' })).toHaveAttribute(
      'data-separated',
      'true',
    );
    expect(await screen.findByText('Carol')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Carol/ })).toHaveAttribute('href', '/u/carol');
  });

  it('keeps the search in the address when it is submitted, and shows its results', async () => {
    vi.mocked(search).mockResolvedValue(
      OK({ questions: [question('q-2', 'Question trouvée')], hashtags: [{ name: 'tests' }], accounts: [] }),
    );
    render(<ExploreScreen initialQuery="" viewer={{ handle: 'viewer', suspended: false }} />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  tests  ' } });
    fireEvent.submit(screen.getByRole('search'));

    expect(replace).toHaveBeenCalledWith('/explore?q=tests', { scroll: false });
    expect(await screen.findByText('Question trouvée')).toBeInTheDocument();
    expect(search).toHaveBeenCalledWith('tests');
  });

  it('shows an empty result without a list when the search finds nothing', async () => {
    render(<ExploreScreen initialQuery="rien" viewer={{ handle: 'viewer', suspended: false }} />);

    expect(await screen.findByRole('heading', { name: 'Aucun résultat' })).toBeInTheDocument();
  });

  it('clears the search and returns to the address of the screen', async () => {
    render(<ExploreScreen initialQuery="tests" viewer={{ handle: 'viewer', suspended: false }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Effacer' }));

    expect(replace).toHaveBeenCalledWith('/explore', { scroll: false });
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });
});

describe('ExploreScreen goes back to a fresh list', () => {
  const FAILED = {
    ok: false,
    status: 500,
    problem: { status: 500, title: 'Erreur', detail: 'Erreur' },
  } as never;

  it('asks the list again when the viewer goes back', async () => {
    vi.mocked(fetchTrends).mockResolvedValue(FAILED);
    vi.mocked(fetchPopular).mockResolvedValue(FAILED);
    vi.mocked(fetchSuggestions).mockResolvedValue(FAILED);
    render(<ExploreScreen initialQuery="" viewer={{ handle: 'viewer', suspended: false }} />);
    await waitFor(() => expect(vi.mocked(fetchTrends)).toHaveBeenCalled());
    const before = vi.mocked(fetchTrends).mock.calls.length;

    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect(vi.mocked(fetchTrends).mock.calls.length).toBeGreaterThan(before));
  });
});
