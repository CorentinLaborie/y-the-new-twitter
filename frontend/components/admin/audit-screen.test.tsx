import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listAuditLog, type AuditEntry } from '@/lib/admin-api';
import { AuditScreen } from './audit-screen';

vi.mock('@/lib/admin-api', () => ({ listAuditLog: vi.fn() }));

const LOGIN: AuditEntry = {
  id: 'a1',
  actorId: '33333333-3333-4333-8333-333333333333',
  action: 'auth.admin_login',
  result: 'ok',
  targetType: 'user',
  targetId: '33333333-3333-4333-8333-333333333333',
  reason: null,
  details: null,
  createdAt: '2026-10-16T08:12:44.000Z',
};

const REFUSED_LOGIN: AuditEntry = {
  ...LOGIN,
  id: 'a2',
  result: 'failed',
  reason: 'Code incorrect',
  createdAt: '2026-10-15T17:30:00.000Z',
};

describe('AuditScreen', () => {
  beforeEach(() => {
    vi.mocked(listAuditLog).mockReset();
  });

  it('lists the entries newest first, with the French name, the code, the result and the reason', async () => {
    vi.mocked(listAuditLog).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [LOGIN, REFUSED_LOGIN], nextCursor: null },
    });
    render(<AuditScreen />);

    const table = await screen.findByRole('table', { name: 'Journal d’audit' });
    expect(within(table).getAllByText('Connexion administrateur')).toHaveLength(2);
    expect(within(table).getByText('Échec')).toBeInTheDocument();
    expect(within(table).getByText('Code incorrect')).toBeInTheDocument();
    expect(within(table).getByText('—')).toBeInTheDocument();
    expect(within(table).getByText('16/10/2026 10h12')).toBeInTheDocument();
  });

  it('reads the log again with the action chosen', async () => {
    vi.mocked(listAuditLog).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [LOGIN], nextCursor: null },
    });
    render(<AuditScreen />);
    await screen.findByText('16/10/2026 10h12');

    fireEvent.change(screen.getByLabelText('Type d’action'), { target: { value: 'auth.mfa_enrol' } });

    expect(listAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'auth.mfa_enrol' }));
  });

  it('appends the next page, with the same action filter', async () => {
    vi.mocked(listAuditLog)
      .mockResolvedValueOnce({ ok: true, status: 200, body: { items: [LOGIN], nextCursor: 'next-1' } })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { items: [REFUSED_LOGIN], nextCursor: null } });
    render(<AuditScreen />);
    await screen.findByText('16/10/2026 10h12');

    fireEvent.click(screen.getByRole('button', { name: 'Charger plus d’entrées' }));

    expect(await screen.findByText('Code incorrect')).toBeInTheDocument();
    expect(listAuditLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'next-1', action: undefined }),
    );
  });

  it('says when the filter matches nothing', async () => {
    vi.mocked(listAuditLog).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [], nextCursor: null },
    });
    render(<AuditScreen />);

    expect(await screen.findByText('Aucune entrée pour ce filtre.')).toBeInTheDocument();
  });
});
