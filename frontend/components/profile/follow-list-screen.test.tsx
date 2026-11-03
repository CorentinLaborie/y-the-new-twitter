import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFollowList } from '@/lib/profile-api';
import { FollowListScreen } from './follow-list-screen';

vi.mock('@/lib/profile-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/profile-api')>();
  return { ...actual, fetchFollowList: vi.fn() };
});

describe('FollowListScreen (L3, section 7.4)', () => {
  beforeEach(() => {
    vi.mocked(fetchFollowList).mockReset();
  });

  it('lists the accounts with their follow pill, and no pill on the viewer’s own row', async () => {
    vi.mocked(fetchFollowList).mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        items: [
          { handle: 'bob', displayName: 'Bob', avatarUrl: null, viewerFollows: true },
          { handle: 'me', displayName: 'Moi', avatarUrl: null, viewerFollows: false },
        ],
        nextCursor: null,
      },
    });

    render(<FollowListScreen handle="alice" list="following" viewerHandle="me" suspended={false} />);

    expect(await screen.findByRole('link', { name: 'Bob' })).toHaveAttribute('href', '/u/bob');
    expect(screen.getByRole('button', { name: 'Suivi @bob' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /@me$/ })).not.toBeInTheDocument();
  });

  it('shows its own empty text for each list', async () => {
    vi.mocked(fetchFollowList).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [], nextCursor: null },
    });

    render(<FollowListScreen handle="alice" list="followers" viewerHandle="me" suspended={false} />);

    expect(await screen.findByText('Aucun abonné pour l’instant.')).toBeInTheDocument();
  });

  it('loads the next page with Voir plus and appends its rows', async () => {
    vi.mocked(fetchFollowList)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          items: [{ handle: 'bob', displayName: 'Bob', avatarUrl: null, viewerFollows: false }],
          nextCursor: 'suite',
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          items: [{ handle: 'carol', displayName: 'Carol', avatarUrl: null, viewerFollows: false }],
          nextCursor: null,
        },
      });

    render(<FollowListScreen handle="alice" list="following" viewerHandle="me" suspended={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Voir plus' }));

    expect(await screen.findByRole('link', { name: 'Carol' })).toBeInTheDocument();
    expect(fetchFollowList).toHaveBeenLastCalledWith('alice', 'following', 'suite');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Voir plus' })).not.toBeInTheDocument());
  });
});

describe('FollowListScreen goes back to a fresh list', () => {
  const FAILED = {
    ok: false,
    status: 500,
    problem: { status: 500, title: 'Erreur', detail: 'Erreur' },
  } as never;

  it('asks the list again when the viewer goes back', async () => {
    vi.mocked(fetchFollowList).mockResolvedValue(FAILED);
    render(<FollowListScreen handle="alice" list="following" viewerHandle="me" suspended={false} />);
    await waitFor(() => expect(vi.mocked(fetchFollowList)).toHaveBeenCalled());
    const before = vi.mocked(fetchFollowList).mock.calls.length;

    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect(vi.mocked(fetchFollowList).mock.calls.length).toBeGreaterThan(before));
  });
});
