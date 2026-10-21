import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signOut } from '@/lib/admin-api';
import { AdminShell, isActiveNavItem } from './admin-shell';

const push = vi.fn();
let pathname = '/admin';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));
vi.mock('@/lib/admin-api', () => ({ signOut: vi.fn() }));

const ADMIN = { handle: 'admin', displayName: 'Administrateur' };

describe('isActiveNavItem', () => {
  it('marks the dashboard only on its own path', () => {
    expect(isActiveNavItem('/admin', '/admin')).toBe(true);
    expect(isActiveNavItem('/admin', '/admin/users')).toBe(false);
  });

  it('marks a section on its path and below it', () => {
    expect(isActiveNavItem('/admin/users', '/admin/users/42')).toBe(true);
    expect(isActiveNavItem('/admin/users', '/admin/audit')).toBe(false);
    expect(isActiveNavItem('/admin/users', '/admin/usersx')).toBe(false);
  });
});

describe('AdminShell', () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(signOut).mockReset();
    pathname = '/admin/audit';
  });

  it('marks the current section and shows the signed-in administrator', () => {
    render(
      <AdminShell user={ADMIN}>
        <p>Contenu</p>
      </AdminShell>,
    );

    expect(screen.getByRole('link', { name: 'Journal d’audit' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Comptes' })).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Administrateur')).toBeInTheDocument();
    expect(screen.getByText('@admin')).toBeInTheDocument();
    expect(screen.getByText('Contenu')).toBeInTheDocument();
  });

  it('ends the session on the server, then goes to the login screen', async () => {
    vi.mocked(signOut).mockResolvedValue({ ok: true, status: 204, body: {} });
    render(<AdminShell user={ADMIN}>{null}</AdminShell>);

    fireEvent.click(screen.getByRole('button', { name: 'Déconnexion' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/login'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
