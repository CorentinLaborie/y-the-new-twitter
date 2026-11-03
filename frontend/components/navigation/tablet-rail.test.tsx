import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TabletRail } from './tablet-rail';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/auth-api', () => ({ logout: vi.fn() }));

const VIEWER = { handle: 'alice', displayName: 'Alice Martin', avatarUrl: null };
const ORIGINAL_HEIGHT = window.innerHeight;

function renderRail(height: number, unread = 0, pathname = '/home') {
  window.innerHeight = height;
  render(<TabletRail pathname={pathname} viewer={VIEWER} unread={unread} />);
  return screen.getByRole('navigation', { name: 'Navigation principale' });
}

describe('TabletRail (plan L0, section 4.2)', () => {
  beforeEach(() => {
    window.innerHeight = ORIGINAL_HEIGHT;
  });

  afterEach(() => {
    window.innerHeight = ORIGINAL_HEIGHT;
  });

  it('shows the icons of the destinations with their full names on a tall window', () => {
    const nav = renderRail(900, 3);

    expect(within(nav).getByRole('link', { name: 'Accueil' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Notifications, 3 non lues' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/u/alice');
    expect(within(nav).getByRole('button', { name: 'Plus' })).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('moves the destinations that do not fit to "Plus", and says so on its badge', () => {
    const nav = renderRail(400, 3);

    expect(within(nav).getByRole('link', { name: 'Accueil' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Notifications, 3 non lues' })).toBeNull();
    expect(within(nav).getByRole('button', { name: 'Plus, 3 non lues' })).toBeInTheDocument();
  });

  it('lists the moved destinations inside the more menu', () => {
    const nav = renderRail(400, 3);

    fireEvent.click(within(nav).getByRole('button', { name: 'Plus, 3 non lues' }));

    const menu = screen.getByRole('dialog', { name: 'Plus' });
    expect(within(menu).getByRole('link', { name: 'Notifications, 3 non lues' })).toHaveAttribute(
      'href',
      '/notifications',
    );
    expect(within(menu).getByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/u/alice');
    expect(within(menu).getByRole('link', { name: 'Paramètres' })).toHaveAttribute('href', '/settings');
  });

  it('shows no count on "Plus" when the notifications stay on the rail', () => {
    const nav = renderRail(900, 3);

    expect(within(nav).getByRole('button', { name: 'Plus' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: /non lues/ })).toBeNull();
  });
});
