import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { followUser, unfollowUser } from '@/lib/follows-api';
import { FollowButton } from './follow-button';

vi.mock('@/lib/follows-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/follows-api')>();
  return { ...actual, followUser: vi.fn(), unfollowUser: vi.fn() };
});

const FOLLOWED = { ok: true, status: 200, body: { handle: 'alice', viewerFollows: true } } as const;
const UNFOLLOWED = { ok: true, status: 204, body: undefined } as const;

function refused(status: number, code?: string) {
  return { ok: false, problem: { status, title: 'Erreur', detail: 'Détail', code } } as const;
}

/** A call that stays pending until the test resolves it. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderButton(props: Partial<Parameters<typeof FollowButton>[0]> = {}) {
  const onChange = vi.fn();
  render(<FollowButton handle="alice" initialFollows={false} onChange={onChange} {...props} />);
  return { onChange };
}

describe('FollowButton', () => {
  beforeEach(() => {
    vi.mocked(followUser).mockReset();
    vi.mocked(unfollowUser).mockReset();
  });

  it('reads "Suivre" when the viewer does not follow, with the accessible name "Suivre @alice"', () => {
    renderButton();

    const button = screen.getByRole('button', { name: 'Suivre @alice' });
    expect(button).toHaveTextContent(/^Suivre$/);
  });

  it('reads "Suivi" when the viewer follows, with the accessible name "Suivi @alice"', () => {
    renderButton({ initialFollows: true });

    const button = screen.getByRole('button', { name: 'Suivi @alice' });
    expect(button).toHaveTextContent(/^Suivi$/);
  });

  it('reads "Ne plus suivre" under the pointer on a followed account, and the name does not change', () => {
    renderButton({ initialFollows: true });
    const button = screen.getByRole('button', { name: 'Suivi @alice' });

    fireEvent.mouseEnter(button);
    expect(button).toHaveTextContent('Ne plus suivre');
    expect(screen.getByRole('button', { name: 'Suivi @alice' })).toBe(button);

    fireEvent.mouseLeave(button);
    expect(button).toHaveTextContent(/^Suivi$/);
  });

  it('keeps "Suivre" under the pointer on an account not followed', () => {
    renderButton();
    const button = screen.getByRole('button', { name: 'Suivre @alice' });

    fireEvent.mouseEnter(button);

    expect(button).toHaveTextContent(/^Suivre$/);
  });

  it('sends PUT when the viewer clicks "Suivre", then shows "Suivi" and reports the new state', async () => {
    vi.mocked(followUser).mockResolvedValue(FOLLOWED);
    const { onChange } = renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Suivre @alice' }));

    expect(followUser).toHaveBeenCalledWith('alice');
    expect(unfollowUser).not.toHaveBeenCalled();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(true));
    expect(screen.getByRole('button', { name: 'Suivi @alice' })).toBeInTheDocument();
  });

  it('sends DELETE when the viewer clicks "Suivi", then shows "Suivre"', async () => {
    vi.mocked(unfollowUser).mockResolvedValue(UNFOLLOWED);
    const { onChange } = renderButton({ initialFollows: true });

    fireEvent.click(screen.getByRole('button', { name: 'Suivi @alice' }));

    expect(unfollowUser).toHaveBeenCalledWith('alice');
    expect(followUser).not.toHaveBeenCalled();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(false));
    expect(screen.getByRole('button', { name: 'Suivre @alice' })).toBeInTheDocument();
  });

  it('changes the state at once, before the answer comes (optimistic update)', async () => {
    const pending = deferred<typeof FOLLOWED>();
    vi.mocked(followUser).mockReturnValue(pending.promise);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Suivre @alice' }));

    expect(screen.getByRole('button', { name: 'Suivi @alice' })).toBeInTheDocument();
    await act(async () => pending.resolve(FOLLOWED));
  });

  it('is off while its call is pending, so a second click sends nothing', async () => {
    const pending = deferred<typeof FOLLOWED>();
    vi.mocked(followUser).mockReturnValue(pending.promise);
    renderButton();
    const button = screen.getByRole('button', { name: 'Suivre @alice' });

    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Suivi @alice' }));

    expect(followUser).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Suivi @alice' })).toHaveAttribute('aria-disabled', 'true');
    await act(async () => pending.resolve(FOLLOWED));
    expect(screen.getByRole('button', { name: 'Suivi @alice' })).not.toHaveAttribute('aria-disabled');
  });

  it('is disabled for a viewer whose account cannot follow, and sends nothing', () => {
    renderButton({ disabled: true });
    const button = screen.getByRole('button', { name: 'Suivre @alice' });

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(followUser).not.toHaveBeenCalled();
  });

  it('shows the state of a suspended viewer without the "Ne plus suivre" label under the pointer', () => {
    renderButton({ initialFollows: true, disabled: true });
    const button = screen.getByRole('button', { name: 'Suivi @alice' });

    fireEvent.mouseEnter(button);

    expect(button).toHaveTextContent(/^Suivi$/);
    expect(button).toBeDisabled();
  });

  it('gives the state back and announces the message when the follow fails', async () => {
    vi.mocked(followUser).mockResolvedValue(refused(429));
    const { onChange } = renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Suivre @alice' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Le suivi n’a pas été enregistré. Réessayez.'),
    );
    expect(screen.getByRole('button', { name: 'Suivre @alice' })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('gives the state back when the unfollow fails, with its own message', async () => {
    vi.mocked(unfollowUser).mockResolvedValue(refused(429));
    const { onChange } = renderButton({ initialFollows: true });

    fireEvent.click(screen.getByRole('button', { name: 'Suivi @alice' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Le suivi n’a pas pu être retiré. Réessayez.'),
    );
    expect(screen.getByRole('button', { name: 'Suivi @alice' })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the French text of a known code on failure', async () => {
    vi.mocked(followUser).mockResolvedValue(refused(403, 'account_pending_deletion'));
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Suivre @alice' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Votre compte est en attente de suppression.'),
    );
  });

  it('is shown as a plain pill, outside any menu, with a 44 px touch target', () => {
    renderButton();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suivre @alice' })).toHaveStyle({ minHeight: '44px' });
  });
});

describe('FollowButton follows the state given by its card', () => {
  it('shows the new state when the card changes it, for example from the menu entry', () => {
    const { rerender } = render(<FollowButton handle="alice" initialFollows />);
    expect(screen.getByRole('button', { name: 'Suivi @alice' })).toBeInTheDocument();

    rerender(<FollowButton handle="alice" initialFollows={false} />);

    expect(screen.getByRole('button', { name: 'Suivre @alice' })).toBeInTheDocument();
  });
});
