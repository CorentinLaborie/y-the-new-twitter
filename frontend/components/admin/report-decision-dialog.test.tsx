import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decideReport, reauthenticate } from '@/lib/admin-api';
import { ReportDecisionDialog } from './report-decision-dialog';

vi.mock('@/lib/admin-api', () => ({ decideReport: vi.fn(), reauthenticate: vi.fn() }));

const REPORT_ID = '2c1d0e9f-8a7b-4c6d-9e5f-1a2b3c4d5e6f';

const RESULT = {
  id: REPORT_ID,
  status: 'resolved' as const,
  decision: 'content_hidden' as const,
  decidedAt: '2026-10-21T12:00:00.000Z',
};

const REAUTH_REQUIRED = {
  ok: false as const,
  problem: {
    status: 403,
    title: 'Interdit',
    detail: 'Ré-authentification requise.',
    code: 'reauth_required',
  },
};

function renderDialog(decision: 'hide' | 'dismiss' = 'hide') {
  const onDecided = vi.fn();
  const onCancel = vi.fn();
  render(
    <ReportDecisionDialog
      reportId={REPORT_ID}
      decision={decision}
      onDecided={onDecided}
      onCancel={onCancel}
    />,
  );
  return { onDecided, onCancel };
}

function typeNote(value: string) {
  fireEvent.change(screen.getByLabelText('Motif (obligatoire)'), { target: { value } });
}

describe('ReportDecisionDialog', () => {
  beforeEach(() => {
    vi.mocked(decideReport).mockReset();
    vi.mocked(reauthenticate).mockReset();
  });

  it('names the hiding of the content, and keeps its button disabled until a note is written', () => {
    renderDialog('hide');

    expect(screen.getByRole('dialog', { name: 'Masquer ce contenu ?' })).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Masquer le contenu' });
    expect(submit).toBeDisabled();

    typeNote('   ');
    expect(submit).toBeDisabled();

    typeNote('Injure');
    expect(submit).toBeEnabled();
  });

  it('names the dismissal of the report', () => {
    renderDialog('dismiss');

    expect(screen.getByRole('dialog', { name: 'Rejeter ce signalement ?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejeter le signalement' })).toBeDisabled();
  });

  it('refuses a note longer than 500 characters', () => {
    renderDialog();

    typeNote('a'.repeat(501));

    expect(screen.getByText('Le motif ne doit pas dépasser 500 caractères.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Masquer le contenu' })).toBeDisabled();
  });

  it('sends the decision with the trimmed note and reports the result', async () => {
    vi.mocked(decideReport).mockResolvedValue({ ok: true, status: 200, body: RESULT });
    const { onDecided } = renderDialog('hide');

    typeNote('  Injure ');
    fireEvent.click(screen.getByRole('button', { name: 'Masquer le contenu' }));

    await waitFor(() => expect(onDecided).toHaveBeenCalledWith(RESULT));
    expect(decideReport).toHaveBeenCalledWith(REPORT_ID, 'hide', 'Injure');
  });

  it('opens the re-authentication, then sends the decision again once it is confirmed', async () => {
    vi.mocked(decideReport)
      .mockResolvedValueOnce(REAUTH_REQUIRED)
      .mockResolvedValueOnce({ ok: true, status: 200, body: RESULT });
    vi.mocked(reauthenticate).mockResolvedValue({
      ok: true,
      status: 200,
      body: { reauthExpiresAt: '2026-10-21T12:10:00.000Z' },
    });
    const { onDecided } = renderDialog('hide');

    typeNote('Injure');
    fireEvent.click(screen.getByRole('button', { name: 'Masquer le contenu' }));

    expect(await screen.findByRole('dialog', { name: 'Confirmer votre identité' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Secret1234!' } });
    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(onDecided).toHaveBeenCalledWith(RESULT));
    expect(decideReport).toHaveBeenCalledTimes(2);
    expect(decideReport).toHaveBeenLastCalledWith(REPORT_ID, 'hide', 'Injure');
  });

  it('shows the API message for another refusal, such as a report already decided', async () => {
    vi.mocked(decideReport).mockResolvedValue({
      ok: false,
      problem: { status: 409, title: 'Conflit', detail: 'Ce signalement a déjà été traité.' },
    });
    const { onDecided } = renderDialog('dismiss');

    typeNote('Pas de règle enfreinte');
    fireEvent.click(screen.getByRole('button', { name: 'Rejeter le signalement' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce signalement a déjà été traité.');
    expect(onDecided).not.toHaveBeenCalled();
  });

  it('closes on cancel', () => {
    const { onCancel } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
