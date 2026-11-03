import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileTopBar } from './mobile-top-bar';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/auth-api', () => ({ logout: vi.fn() }));

const VIEWER = { handle: 'alice', displayName: 'Alice Martin', avatarUrl: null };

function renderTopBar(unread: number) {
  render(<MobileTopBar pathname="/home" viewer={VIEWER} unread={unread} />);
}

describe('MobileTopBar (plan L0, section 5.4)', () => {
  it('shows the logo and the menu button', () => {
    renderTopBar(0);

    expect(screen.getByRole('link', { name: 'Y, accueil' })).toHaveAttribute('href', '/home');
    expect(screen.getByRole('button', { name: 'Ouvrir le menu' })).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('shows a dot on the menu button when a notification is unread, and says so in its name', () => {
    renderTopBar(2);
    const button = screen.getByRole('button', { name: 'Ouvrir le menu, notifications non lues' });

    expect(button.querySelector('span[aria-hidden="true"]')).not.toBeNull();
  });

  it('shows no dot when nothing is unread', () => {
    renderTopBar(0);
    const button = screen.getByRole('button', { name: 'Ouvrir le menu' });

    expect(button.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it('opens the full-screen menu with the seven destinations and the secondary links', () => {
    renderTopBar(0);

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));

    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(menu).toHaveAttribute('aria-modal', 'true');
    const destinations = within(within(menu).getByRole('navigation', { name: 'Destinations' }));
    expect(destinations.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/home',
      '/explore',
      '/notifications',
      '/messages',
      '/bookmarks',
      '/u/alice',
    ]);
    expect(within(menu).getByRole('link', { name: 'Poster' })).toHaveAttribute('href', '/home#composer');
    expect(within(menu).getByRole('link', { name: 'Paramètres' })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'Déconnexion' })).toBeInTheDocument();
  });

  it('closes the full-screen menu with its close button', () => {
    renderTopBar(0);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));

    fireEvent.click(screen.getByRole('button', { name: 'Fermer le menu' }));

    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull();
  });
});
