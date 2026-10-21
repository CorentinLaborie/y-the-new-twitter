import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listAuditLog, type AuditEntry } from '@/lib/admin-api';
import { DashboardScreen, RECENT_ACTIONS_LIMIT } from './dashboard-screen';

vi.mock('@/lib/admin-api', () => ({ listAuditLog: vi.fn() }));

const ENTRY: AuditEntry = {
  id: 'd1',
  actorId: '33333333-3333-4333-8333-333333333333',
  action: 'auth.admin_login',
  result: 'ok',
  targetType: 'user',
  targetId: '33333333-3333-4333-8333-333333333333',
  reason: null,
  details: null,
  createdAt: '2026-10-16T08:12:00.000Z',
};

describe('DashboardScreen', () => {
  beforeEach(() => {
    vi.mocked(listAuditLog).mockReset();
  });

  it('shows the latest actions of the audit log', async () => {
    vi.mocked(listAuditLog).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [ENTRY], nextCursor: null },
    });
    render(<DashboardScreen />);

    expect(await screen.findByText('Connexion administrateur')).toBeInTheDocument();
    expect(screen.getByText('16/10/2026 08h12')).toBeInTheDocument();
    expect(screen.getByText('Réussi')).toBeInTheDocument();
    expect(listAuditLog).toHaveBeenCalledWith({ limit: RECENT_ACTIONS_LIMIT });
  });

  it('says when no action is recorded yet', async () => {
    vi.mocked(listAuditLog).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [], nextCursor: null },
    });
    render(<DashboardScreen />);

    expect(await screen.findByText('Aucune action enregistrée pour le moment.')).toBeInTheDocument();
  });

  it('shows the API message when the log cannot be read', async () => {
    vi.mocked(listAuditLog).mockResolvedValue({
      ok: false,
      problem: { status: 0, title: 'Réseau', detail: 'Le serveur est injoignable.' },
    });
    render(<DashboardScreen />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Le serveur est injoignable.');
  });
});
