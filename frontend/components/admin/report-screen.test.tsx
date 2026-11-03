import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decideReport, getReport, reauthenticate, restoreReport, type ReportDetail } from '@/lib/admin-api';
import { ReportScreen } from './report-screen';

vi.mock('@/lib/admin-api', () => ({
  getReport: vi.fn(),
  decideReport: vi.fn(),
  reauthenticate: vi.fn(),
  restoreReport: vi.fn(),
}));

const REPORT_ID = '2c1d0e9f-8a7b-4c6d-9e5f-1a2b3c4d5e6f';

const OPEN: ReportDetail = {
  id: REPORT_ID,
  createdAt: '2026-10-14T10:41:00.000Z',
  reason: 'spam',
  status: 'open',
  decision: null,
  decisionNote: null,
  decidedAt: null,
  target: {
    type: 'question',
    id: '5f1c7d2e-9a3b-4c8d-8e2f-7a6b5c4d3e2f',
    body: 'Pourquoi les gens préfèrent-ils les réponses rapides ?',
    authorHandle: 'AliceY',
    authorDisplayName: 'Alice',
    authorAvatarUrl: null,
    moderationStatus: 'visible',
    createdAt: '2026-10-10T08:00:00.000Z',
  },
  reports: [
    { id: REPORT_ID, createdAt: '2026-10-14T10:41:00.000Z', reason: 'spam', details: null, status: 'open' },
  ],
};

const HIDDEN: ReportDetail = {
  ...OPEN,
  status: 'resolved',
  decision: 'content_hidden',
  decisionNote: 'Spam répété',
  decidedAt: '2026-10-15T16:48:00.000Z',
  target: { ...OPEN.target, moderationStatus: 'hidden' },
  reports: [{ ...OPEN.reports[0]!, status: 'resolved' }],
};

describe('ReportScreen', () => {
  beforeEach(() => {
    vi.mocked(getReport).mockReset();
    vi.mocked(decideReport).mockReset();
    vi.mocked(reauthenticate).mockReset();
  });

  it('shows the reported content, its author and the history, without the reporter', async () => {
    vi.mocked(getReport).mockResolvedValue({ ok: true, status: 200, body: OPEN });
    render(<ReportScreen id={REPORT_ID} />);

    expect(
      await screen.findByText('Pourquoi les gens préfèrent-ils les réponses rapides ?'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Question de @AliceY · Alice/)).toBeInTheDocument();
    expect(screen.getByText('Signalement examiné')).toBeInTheDocument();
    expect(screen.getByText(/identité non affichée/)).toBeInTheDocument();
    expect(getReport).toHaveBeenCalledWith(REPORT_ID);
    expect(screen.getByRole('link', { name: 'Retour à la file des signalements' })).toHaveAttribute(
      'href',
      '/admin/reports',
    );
  });

  it('offers the two decisions while the report is open', async () => {
    vi.mocked(getReport).mockResolvedValue({ ok: true, status: 200, body: OPEN });
    render(<ReportScreen id={REPORT_ID} />);

    expect(await screen.findByRole('button', { name: 'Masquer le contenu' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Rejeter le signalement' })).toBeEnabled();
  });

  it('disables the decisions of a decided report, and shows the decision and its note', async () => {
    vi.mocked(getReport).mockResolvedValue({ ok: true, status: 200, body: HIDDEN });
    render(<ReportScreen id={REPORT_ID} />);

    expect(await screen.findByRole('button', { name: 'Masquer le contenu' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rejeter le signalement' })).toBeDisabled();
    expect(screen.getByText('Motif de la décision : Spam répété')).toBeInTheDocument();
    const history = screen.getByRole('heading', { name: 'Historique du signalement' }).closest('section');
    expect(within(history!).getByText('Contenu masqué')).toBeInTheDocument();
    expect(screen.getByText('Contenu masqué', { selector: 'dd' })).toBeInTheDocument();
  });

  it('offers the restoration only for a content hidden by a decision (L7)', async () => {
    vi.mocked(getReport).mockResolvedValue({ ok: true, status: 200, body: HIDDEN });
    const { unmount } = render(<ReportScreen id={REPORT_ID} />);

    expect(await screen.findByRole('button', { name: 'Restaurer le contenu' })).toBeEnabled();
    unmount();

    vi.mocked(getReport).mockResolvedValue({ ok: true, status: 200, body: OPEN });
    render(<ReportScreen id={REPORT_ID} />);
    await screen.findByRole('button', { name: 'Masquer le contenu' });
    expect(screen.queryByRole('button', { name: 'Restaurer le contenu' })).not.toBeInTheDocument();
  });

  it('records the hiding of the content, then reads the report again', async () => {
    vi.mocked(getReport)
      .mockResolvedValueOnce({ ok: true, status: 200, body: OPEN })
      .mockResolvedValueOnce({ ok: true, status: 200, body: HIDDEN });
    vi.mocked(decideReport).mockResolvedValue({
      ok: true,
      status: 200,
      body: { id: REPORT_ID, status: 'resolved', decision: 'content_hidden', decidedAt: HIDDEN.decidedAt! },
    });
    render(<ReportScreen id={REPORT_ID} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Masquer le contenu' }));
    const dialog = screen.getByRole('dialog', { name: 'Masquer ce contenu ?' });
    fireEvent.change(within(dialog).getByLabelText('Motif (obligatoire)'), {
      target: { value: 'Spam répété' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Masquer le contenu' }));

    await waitFor(() => expect(getReport).toHaveBeenCalledTimes(2));
    expect(decideReport).toHaveBeenCalledWith(REPORT_ID, 'hide', 'Spam répété');
    expect(await screen.findByRole('button', { name: 'Masquer le contenu' })).toBeDisabled();
  });

  it('shows the API message when the report cannot be read', async () => {
    vi.mocked(getReport).mockResolvedValue({
      ok: false,
      problem: { status: 404, title: 'Introuvable', detail: 'Signalement introuvable.' },
    });
    render(<ReportScreen id={REPORT_ID} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Signalement introuvable.');
  });
});
