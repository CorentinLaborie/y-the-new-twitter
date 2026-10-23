import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { followUser, unfollowUser } from '@/lib/follows-api';
import { UnfollowMenuItem } from './unfollow-menu-item';

vi.mock('@/lib/follows-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/follows-api')>();
  return { ...actual, followUser: vi.fn(), unfollowUser: vi.fn() };
});

function renderItem(props: Partial<Parameters<typeof UnfollowMenuItem>[0]> = {}) {
  const onUnfollowed = vi.fn();
  render(
    <div role="menu" aria-label="Options de la question">
      <UnfollowMenuItem handle="alice" follows onUnfollowed={onUnfollowed} {...props} />
    </div>,
  );
  return { onUnfollowed };
}

describe('UnfollowMenuItem', () => {
  beforeEach(() => {
    vi.mocked(followUser).mockReset();
    vi.mocked(unfollowUser).mockReset();
  });

  it('is shown as a menu entry "Ne plus suivre @alice" when the viewer follows the account', () => {
    renderItem();

    expect(screen.getByRole('menuitem', { name: 'Ne plus suivre @alice' })).toBeInTheDocument();
  });

  it('is absent when the viewer does not follow the account', () => {
    const { container } = render(
      <div role="menu" aria-label="Options de la question">
        <UnfollowMenuItem handle="alice" follows={false} />
      </div>,
    );

    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(container.querySelector('p')).toBeNull();
  });

  it('sends the same DELETE as the follow pill, and reports the unfollow', async () => {
    vi.mocked(unfollowUser).mockResolvedValue({ ok: true, status: 204, body: undefined });
    const { onUnfollowed } = renderItem();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Ne plus suivre @alice' }));

    expect(unfollowUser).toHaveBeenCalledWith('alice');
    expect(followUser).not.toHaveBeenCalled();
    await waitFor(() => expect(onUnfollowed).toHaveBeenCalledTimes(1));
  });

  it('keeps the entry and announces the message when the unfollow fails', async () => {
    vi.mocked(unfollowUser).mockResolvedValue({
      ok: false,
      problem: { status: 429, title: 'Limite', detail: 'Trop de requêtes.' },
    });
    const { onUnfollowed } = renderItem();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Ne plus suivre @alice' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Le suivi n’a pas pu être retiré. Réessayez.'),
    );
    expect(screen.getByRole('menuitem', { name: 'Ne plus suivre @alice' })).toBeInTheDocument();
    expect(onUnfollowed).not.toHaveBeenCalled();
  });
});
