import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchUnreadCount } from '@/lib/notifications-api';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/notifications',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/notifications-api', () => ({
  fetchUnreadCount: vi.fn(),
  NOTIFICATIONS_READ_EVENT: 'y:notifications-read',
}));
vi.mock('@/lib/auth-api', () => ({ logout: vi.fn() }));

const VIEWER = { handle: 'alice', displayName: 'Alice Martin', avatarUrl: null };

describe('AppShell (plan L0, sections 4, 5 and 6)', () => {
  beforeEach(() => {
    vi.mocked(fetchUnreadCount).mockReset();
    vi.mocked(fetchUnreadCount).mockResolvedValue({ ok: true, status: 200, body: { unread: 3 } });
  });

  it('renders the page content once, between the navigation of the widths', () => {
    render(
      <AppShell viewer={VIEWER}>
        <p>Contenu de la page</p>
      </AppShell>,
    );

    expect(screen.getAllByText('Contenu de la page')).toHaveLength(1);
    expect(screen.getAllByRole('navigation', { name: 'Navigation principale' })).toHaveLength(3);
  });

  it('gives the badge of the unread count to every width, with the same name', async () => {
    render(
      <AppShell viewer={VIEWER}>
        <p>Contenu</p>
      </AppShell>,
    );

    const links = await screen.findAllByRole('link', { name: 'Notifications, 3 non lues' });
    expect(links).toHaveLength(3);
    expect(fetchUnreadCount).toHaveBeenCalled();
  });

  it('marks the current page in each navigation', async () => {
    render(
      <AppShell viewer={VIEWER}>
        <p>Contenu</p>
      </AppShell>,
    );

    await waitFor(() => expect(fetchUnreadCount).toHaveBeenCalled());
    for (const nav of screen.getAllByRole('navigation', { name: 'Navigation principale' })) {
      expect(within(nav).getByRole('link', { name: /Notifications/ })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
  });
});
