import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDashboard, listAuditLog, type AuditEntry, type DashboardView } from '@/lib/admin-api';
import { DashboardScreen } from './dashboard-screen';

vi.mock('@/lib/admin-api', () => ({ listAuditLog: vi.fn(), getDashboard: vi.fn() }));

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

const FIGURES: DashboardView = {
  openReportCount: 4,
  oldestOpenReportAt: '2026-10-13T11:07:00.000Z',
  averageHandlingSeconds: 93840,
  pendingDeletionCount: 1,
  nextPurgeAt: '2026-12-31T00:00:00.000Z',
};

const AUDIT_OK = { ok: true as const, status: 200, body: { items: [ENTRY], nextCursor: null } };
const DASHBOARD_OK = { ok: true as const, status: 200, body: FIGURES };

describe('DashboardScreen', () => {
  beforeEach(() => {
    vi.mocked(listAuditLog).mockReset();
    vi.mocked(getDashboard).mockReset();
    vi.mocked(getDashboard).mockResolvedValue(DASHBOARD_OK);
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

  it('shows the indicators of the reports and of the account deletions', async () => {
    vi.mocked(listAuditLog).mockResolvedValue(AUDIT_OK);
    render(<DashboardScreen />);

    const indicators = await screen.findByLabelText('Indicateurs');
    expect(within(indicators).getByText('Signalements ouverts')).toBeInTheDocument();
    expect(within(indicators).getByText('Sans décision à ce jour')).toBeInTheDocument();
    expect(within(indicators).getByText('Ouvert le 13/10/2026 13h07')).toBeInTheDocument();
    expect(within(indicators).getByText('1 j 2 h')).toBeInTheDocument();
    expect(within(indicators).getByText('Moyenne sur les 30 derniers jours')).toBeInTheDocument();
    expect(within(indicators).getByText('Comptes en attente de suppression')).toBeInTheDocument();
    expect(within(indicators).getByText('Prochaine purge le 31/12/2026')).toBeInTheDocument();
  });

  it('shows the age of the oldest open report, from its creation to now', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T11:07:00.000Z'));
    vi.mocked(listAuditLog).mockResolvedValue(AUDIT_OK);
    render(<DashboardScreen />);

    const indicators = await screen.findByLabelText('Indicateurs');
    expect(within(indicators).getByText('6 j')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('gives dashes and empty notes when there is nothing to count', async () => {
    vi.mocked(getDashboard).mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        openReportCount: 0,
        oldestOpenReportAt: null,
        averageHandlingSeconds: null,
        pendingDeletionCount: 0,
        nextPurgeAt: null,
      },
    });
    vi.mocked(listAuditLog).mockResolvedValue(AUDIT_OK);
    render(<DashboardScreen />);

    const indicators = await screen.findByLabelText('Indicateurs');
    expect(within(indicators).getAllByText('—')).toHaveLength(2);
    expect(within(indicators).getByText('Aucun signalement ouvert')).toBeInTheDocument();
    expect(within(indicators).getByText('Aucune purge programmée')).toBeInTheDocument();
  });

  it('shows the API message when the indicators cannot be read, and keeps the latest actions', async () => {
    vi.mocked(getDashboard).mockResolvedValue({
      ok: false,
      problem: { status: 500, title: 'Erreur', detail: 'Les indicateurs sont indisponibles.' },
    });
    vi.mocked(listAuditLog).mockResolvedValue(AUDIT_OK);
    render(<DashboardScreen />);

    expect(await screen.findByText('Les indicateurs sont indisponibles.')).toBeInTheDocument();
    expect(await screen.findByText('Connexion administrateur')).toBeInTheDocument();
  });
});
