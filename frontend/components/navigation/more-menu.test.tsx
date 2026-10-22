import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logout } from '@/lib/auth-api';
import { moreBadgeCount, MoreMenu, MoreTrigger } from './more-menu';
import { NAV_ENTRIES, type NavEntry } from './nav-items';

const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock('@/lib/auth-api', () => ({ logout: vi.fn() }));

const VIEWER = { handle: 'alice', displayName: 'Alice Martin' };
const NOTIFICATIONS = NAV_ENTRIES.filter((entry) => entry.id === 'notifications');
const BOOKMARKS_AND_PROFILE = NAV_ENTRIES.filter(
  (entry) => entry.id === 'bookmarks' || entry.id === 'profile',
);

/** A trigger and its menu, as a bar holds them: the menu opens from the button, and closes with it. */
function Harness({ overflow }: { overflow: readonly NavEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MoreTrigger variant="bar" expanded={open} badgeCount={0} onClick={() => setOpen(!open)} />
      <MoreMenu
        open={open}
        onClose={() => setOpen(false)}
        overflow={overflow}
        viewer={VIEWER}
        pathname="/home"
        unread={2}
      />
    </>
  );
}

/** Every control of the dialog, in the order of the page (what Tab goes through). */
function controlsOf(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button'));
}

describe('moreBadgeCount (decision 16)', () => {
  it('shows the unread count only when the notifications are in the menu', () => {
    expect(moreBadgeCount(NOTIFICATIONS, 4)).toBe(4);
    expect(moreBadgeCount(BOOKMARKS_AND_PROFILE, 4)).toBe(0);
    expect(moreBadgeCount([], 4)).toBe(0);
  });
});

describe('MoreMenu (plan L0, section 5.3)', () => {
  beforeEach(() => {
    vi.mocked(logout).mockReset();
    vi.mocked(logout).mockResolvedValue({ ok: true, status: 204, body: {} });
    replace.mockReset();
    refresh.mockReset();
  });

  it('opens from its trigger as a dialog, with the focus inside it', () => {
    render(<Harness overflow={BOOKMARKS_AND_PROFILE} />);

    fireEvent.click(screen.getByRole('button', { name: 'Plus' }));

    const dialog = screen.getByRole('dialog', { name: 'Plus' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('lists the destinations that do not fit, then the settings, the legal pages and the sign-out', () => {
    render(<Harness overflow={BOOKMARKS_AND_PROFILE} />);

    fireEvent.click(screen.getByRole('button', { name: 'Plus' }));

    const dialog = screen.getByRole('dialog', { name: 'Plus' });
    expect(within(dialog).getByRole('link', { name: 'Signets' })).toHaveAttribute('href', '/bookmarks');
    expect(within(dialog).getByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/u/alice');
    expect(within(dialog).getByRole('link', { name: 'Paramètres' })).toHaveAttribute('href', '/settings');
    expect(within(dialog).getByRole('link', { name: 'Conditions d’utilisation' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(within(dialog).getByRole('link', { name: 'Politique de confidentialité' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(within(dialog).getByRole('link', { name: 'Utilisation des cookies' })).toHaveAttribute(
      'href',
      '/cookies',
    );
    expect(within(dialog).getByRole('button', { name: 'Déconnexion' })).toBeInTheDocument();
  });

  it('closes with Escape and gives the focus back to its trigger', () => {
    render(<Harness overflow={[]} />);
    const trigger = screen.getByRole('button', { name: 'Plus' });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Plus' })).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes from the close button and from the backdrop', () => {
    render(<Harness overflow={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Plus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog', { name: 'Plus' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Plus' }));
    fireEvent.click(document.querySelector('div[aria-hidden="true"]') as HTMLElement);
    expect(screen.queryByRole('dialog', { name: 'Plus' })).toBeNull();
  });

  it('keeps Tab inside the dialog: from its last control back to its first', () => {
    render(<Harness overflow={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plus' }));
    const controls = controlsOf(screen.getByRole('dialog', { name: 'Plus' }));

    act(() => controls[controls.length - 1].focus());
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(document.activeElement).toBe(controls[0]);
  });

  it('signs out, then sends the visitor to the login page', async () => {
    render(<Harness overflow={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plus' }));

    fireEvent.click(screen.getByRole('button', { name: 'Déconnexion' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalled();
  });
});
