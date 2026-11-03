import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopSidebar } from './desktop-sidebar';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/auth-api', () => ({ logout: vi.fn() }));

const VIEWER = { handle: 'alice', displayName: 'Alice Martin', avatarUrl: null };

function renderSidebar(pathname: string, unread = 0) {
  render(<DesktopSidebar pathname={pathname} viewer={VIEWER} unread={unread} />);
  return screen.getByRole('navigation', { name: 'Navigation principale' });
}

describe('DesktopSidebar (plan L0, section 4.1)', () => {
  it('lists the logo, the seven destinations in order, and the "Poster" button', () => {
    const nav = renderSidebar('/home');
    const hrefs = within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));

    expect(hrefs).toEqual([
      '/home',
      '/home',
      '/explore',
      '/notifications',
      '/messages',
      '/bookmarks',
      '/u/alice',
      '/home#composer',
    ]);
  });

  it('marks the current page with aria-current, and only that one', () => {
    const nav = renderSidebar('/u/alice');

    expect(within(nav).getByRole('link', { name: 'Profil' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Accueil' })).not.toHaveAttribute('aria-current');
  });

  it('shows the unread count in the name of the notifications link, and hides the badge at 0', () => {
    const nav = renderSidebar('/home', 3);
    const link = within(nav).getByRole('link', { name: 'Notifications, 3 non lues' });

    expect(link).toHaveTextContent('3');
    expect(link.querySelector('span[aria-hidden="true"]')).toHaveTextContent('3');
  });

  it('shows no badge and the plain name when nothing is unread', () => {
    const nav = renderSidebar('/home', 0);
    const link = within(nav).getByRole('link', { name: 'Notifications' });

    expect(link.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it('opens the more menu from "Plus" and closes it with Escape', () => {
    const nav = renderSidebar('/home');
    const plus = within(nav).getByRole('button', { name: 'Plus' });

    fireEvent.click(plus);

    expect(plus).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Plus' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Déconnexion' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Plus' })).toBeNull();
    expect(plus).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the same menu from the account block, named after the viewer', () => {
    const nav = renderSidebar('/home');
    const account = within(nav).getByRole('button', { name: /Alice Martin/ });

    fireEvent.click(account);

    expect(account).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Plus' })).toBeInTheDocument();
  });
});
