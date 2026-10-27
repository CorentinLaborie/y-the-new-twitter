import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHashtagPage } from '@/lib/explore-api';
import type { FeedQuestion } from '@/lib/feed-api';
import { HashtagScreen } from './hashtag-screen';

vi.mock('@/lib/explore-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/explore-api')>();
  return { ...actual, fetchHashtagPage: vi.fn() };
});

function question(id: string, text: string): FeedQuestion {
  return {
    id,
    text,
    hashtags: ['tests'],
    createdAt: '2026-10-27T10:00:00.000Z',
    author: { handle: 'alice', displayName: 'Alice', viewerFollows: false },
    counters: { like: 0, dislike: 0, y: 0, reply: 0 },
    yThreshold: 50,
    conversationOpen: false,
    viewerReactions: [],
    viewerSaved: false,
  };
}

const OK = (body: unknown) => ({ ok: true, status: 200, body }) as never;

describe('HashtagScreen (M4)', () => {
  beforeEach(() => {
    vi.mocked(fetchHashtagPage).mockReset();
  });

  it('shows the newest questions of the hashtag, and « Voir plus » adds the next page after them', async () => {
    vi.mocked(fetchHashtagPage)
      .mockResolvedValueOnce(OK({ questions: [question('q-1', 'Première')], nextCursor: 'c-1' }))
      .mockResolvedValueOnce(OK({ questions: [question('q-2', 'Seconde')], nextCursor: null }));
    render(<HashtagScreen tag="tests" viewer={{ handle: 'viewer', suspended: false }} />);

    expect(await screen.findByText('Première')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voir plus' }));

    expect(await screen.findByText('Seconde')).toBeInTheDocument();
    expect(screen.getByText('Première')).toBeInTheDocument();
    expect(fetchHashtagPage).toHaveBeenLastCalledWith('tests', 'c-1');
    expect(screen.queryByRole('button', { name: 'Voir plus' })).not.toBeInTheDocument();
  });

  it('says so when the hashtag has no question yet', async () => {
    vi.mocked(fetchHashtagPage).mockResolvedValue(OK({ questions: [], nextCursor: null }));
    render(<HashtagScreen tag="rien" viewer={{ handle: 'viewer', suspended: false }} />);

    expect(await screen.findByRole('heading', { name: 'Aucune question avec #rien' })).toBeInTheDocument();
  });
});
