import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signOut } from '@/lib/admin-api';
import { AdminShell } from './admin-shell';

const push = vi.fn();
let pathname = '/admin';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));
vi.mock('@/lib/admin-api', () => ({ signOut: vi.fn() }));

const ADMIN = { handle: 'admin', displayName: 'Administrateur', avatarUrl: null };


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
    expect(screen.getByRole('link', { name: 'Signalements' })).toHaveAttribute('href', '/admin/reports');
    expect(screen.getByRole('link', { name: 'Tribunal des bannis' })).toHaveAttribute(
      'href',
      '/admin/support',
    );
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
