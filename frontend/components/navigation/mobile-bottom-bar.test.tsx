import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileBottomBar } from './mobile-bottom-bar';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/auth-api', () => ({ logout: vi.fn() }));

const VIEWER = { handle: 'alice', displayName: 'Alice Martin' };

function renderBar(pathname: string, unread = 0) {
  render(<MobileBottomBar pathname={pathname} viewer={VIEWER} unread={unread} />);
  return screen.getByRole('navigation', { name: 'Navigation principale' });
}

describe('MobileBottomBar (plan L0, sections 5.1 and 5.2)', () => {
  it('shows Accueil, Explorer, Notifications, Messages and then "Plus" as the fifth case', () => {
    const nav = renderBar('/home');
    const items = within(nav).getAllByRole('listitem');

    expect(items).toHaveLength(5);
    expect(items.map((item) => item.textContent)).toEqual([
      'Accueil',
      'Explorer',
      'Notifications',
      'Messages',
      'Plus',
    ]);
  });

  it('shows the label under each icon', () => {
    const nav = renderBar('/home');

    expect(within(nav).getByRole('link', { name: 'Explorer' })).toHaveTextContent('Explorer');
    expect(within(nav).getByRole('button', { name: 'Plus' })).toHaveTextContent('Plus');
  });

  it('marks the current page with aria-current', () => {
    const nav = renderBar('/messages');

    expect(within(nav).getByRole('link', { name: 'Messages' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Accueil' })).not.toHaveAttribute('aria-current');
  });

  it('names the notifications link with the exact count and shows the badge', () => {
    const nav = renderBar('/home', 3);
    const link = within(nav).getByRole('link', { name: 'Notifications, 3 non lues' });

    expect(link.querySelector('span[aria-hidden="true"]')).toHaveTextContent('3');
  });

  it('shows 99+ above 99 unread lines, and the full count in the name', () => {
    const nav = renderBar('/home', 120);
    const link = within(nav).getByRole('link', { name: 'Notifications, 120 non lues' });

    expect(link.querySelector('span[aria-hidden="true"]')).toHaveTextContent('99+');
  });

  it('hides the badge at 0', () => {
    const nav = renderBar('/home', 0);

    expect(
      within(nav).getByRole('link', { name: 'Notifications' }).querySelector('span[aria-hidden="true"]'),
    ).toBeNull();
  });

  it('opens the "Plus" sheet with Signets, Profil and the secondary links', () => {
    const nav = renderBar('/home');
    const plus = within(nav).getByRole('button', { name: 'Plus' });

    fireEvent.click(plus);

    const sheet = screen.getByRole('dialog', { name: 'Plus' });
    expect(plus).toHaveAttribute('aria-expanded', 'true');
    expect(within(sheet).getByRole('link', { name: 'Signets' })).toHaveAttribute('href', '/bookmarks');
    expect(within(sheet).getByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/u/alice');
    expect(within(sheet).getByRole('button', { name: 'Déconnexion' })).toBeInTheDocument();
  });
});
