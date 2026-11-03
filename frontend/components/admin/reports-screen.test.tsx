import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listReports, type ReportListItem } from '@/lib/admin-api';
import { ReportsScreen } from './reports-screen';

vi.mock('@/lib/admin-api', () => ({ listReports: vi.fn() }));

const REPORT: ReportListItem = {
  id: '2c1d0e9f-8a7b-4c6d-9e5f-1a2b3c4d5e6f',
  createdAt: '2026-10-13T11:07:00.000Z',
  reason: 'hate',
  status: 'open',
  reportCount: 2,
  target: {
    type: 'reply',
    id: '7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b',
    body: 'Peut-être que les gens ont envie de se protéger derrière un écran ?',
    authorHandle: 'Robert44',
    authorDisplayName: 'Robert',
    authorAvatarUrl: null,
    moderationStatus: 'visible',
    createdAt: '2026-10-12T09:00:00.000Z',
  },
};

const DECIDED: ReportListItem = {
  ...REPORT,
  id: '3d4e5f60-7182-4930-a1b2-c3d4e5f60718',
  reason: 'spam',
  status: 'dismissed',
  reportCount: 1,
  target: { ...REPORT.target, type: 'question', authorHandle: 'AliceY', body: 'x'.repeat(120) },
};

function table() {
  return screen.getByRole('table', { name: 'Signalements' });
}

describe('ReportsScreen', () => {
  beforeEach(() => {
    vi.mocked(listReports).mockReset();
  });

  it('lists the reports with their date, reason, target, count and status, each linked to its examination', async () => {
    vi.mocked(listReports).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [REPORT], nextCursor: null },
    });
    render(<ReportsScreen />);

    const link = await screen.findByRole('link', { name: 'Examiner le signalement du 13/10/2026 13h07' });
    expect(link).toHaveAttribute('href', `/admin/reports/${REPORT.id}`);
    expect(within(table()).getByText('13/10/2026 13h07')).toBeInTheDocument();
    expect(within(table()).getByText('Propos haineux')).toBeInTheDocument();
    expect(within(table()).getByText('Réponse')).toBeInTheDocument();
    expect(within(table()).getByText(/Auteur : @Robert44/)).toBeInTheDocument();
    expect(within(table()).getByText('2')).toBeInTheDocument();
    expect(within(table()).getByText('Ouvert')).toBeInTheDocument();
    expect(listReports).toHaveBeenCalledWith({
      status: undefined,
      reason: undefined,
      cursor: undefined,
      limit: 20,
    });
  });

  it('cuts a long excerpt of the reported content', async () => {
    vi.mocked(listReports).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [DECIDED], nextCursor: null },
    });
    render(<ReportsScreen />);

    expect(await screen.findByText(`Auteur : @AliceY · ${'x'.repeat(90)}…`)).toBeInTheDocument();
    expect(within(table()).getByText('Rejeté')).toBeInTheDocument();
  });

  it('restarts the list from the first page when the status or the reason changes', async () => {
    vi.mocked(listReports).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [REPORT], nextCursor: null },
    });
    render(<ReportsScreen />);
    await screen.findByRole('link', { name: /Examiner/ });

    fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'decided' } });
    await waitFor(() =>
      expect(listReports).toHaveBeenLastCalledWith({
        status: 'decided',
        reason: undefined,
        cursor: undefined,
        limit: 20,
      }),
    );

    fireEvent.change(screen.getByLabelText('Motif'), { target: { value: 'harassment' } });
    await waitFor(() =>
      expect(listReports).toHaveBeenLastCalledWith({
        status: 'decided',
        reason: 'harassment',
        cursor: undefined,
        limit: 20,
      }),
    );
  });

  it('appends the next page, with the filter of the list', async () => {
    vi.mocked(listReports)
      .mockResolvedValueOnce({ ok: true, status: 200, body: { items: [REPORT], nextCursor: 'cursor-1' } })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { items: [DECIDED], nextCursor: null } });
    render(<ReportsScreen />);
    await screen.findByRole('link', { name: /Examiner/ });

    fireEvent.click(screen.getByRole('button', { name: 'Charger plus de signalements' }));

    await waitFor(() => expect(screen.getAllByRole('link', { name: /Examiner/ })).toHaveLength(2));
    expect(listReports).toHaveBeenLastCalledWith({
      status: undefined,
      reason: undefined,
      cursor: 'cursor-1',
      limit: 20,
    });
    expect(screen.queryByRole('button', { name: 'Charger plus de signalements' })).not.toBeInTheDocument();
  });

  it('says when no report matches the filter', async () => {
    vi.mocked(listReports).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [], nextCursor: null },
    });
    render(<ReportsScreen />);

    expect(await screen.findByText('Aucun signalement ne correspond à ce filtre.')).toBeInTheDocument();
  });

  it('shows the API message when the list cannot be read', async () => {
    vi.mocked(listReports).mockResolvedValue({
      ok: false,
      problem: { status: 500, title: 'Erreur', detail: 'Le service est indisponible.' },
    });
    render(<ReportsScreen />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Le service est indisponible.');
  });
});

describe('ReportsScreen goes back to a fresh list', () => {
  const FAILED = {
    ok: false,
    status: 500,
    problem: { status: 500, title: 'Erreur', detail: 'Erreur' },
  } as never;

  it('asks the list again when the viewer goes back', async () => {
    vi.mocked(listReports).mockResolvedValue(FAILED);
    render(<ReportsScreen />);
    await waitFor(() => expect(vi.mocked(listReports)).toHaveBeenCalled());
    const before = vi.mocked(listReports).mock.calls.length;

    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect(vi.mocked(listReports).mock.calls.length).toBeGreaterThan(before));
  });
});
