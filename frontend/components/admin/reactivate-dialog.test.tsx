import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactivateAccount, reauthenticate } from '@/lib/admin-api';
import { ReactivateDialog } from './reactivate-dialog';

vi.mock('@/lib/admin-api', () => ({ reauthenticate: vi.fn(), reactivateAccount: vi.fn() }));

const RESULT = {
  id: 'account-1',
  status: 'active' as const,
  statusChangedAt: '2026-10-21T12:00:00.000Z',
  suspensionReason: null,
};

const REAUTH_REQUIRED = {
  ok: false as const,
  problem: { status: 403, title: 'Interdit', detail: 'Ré-authentification requise.', code: 'reauth_required' },
};

function renderDialog() {
  const onReactivated = vi.fn();
  const onCancel = vi.fn();
  render(<ReactivateDialog accountId="account-1" handle="MarkL" onReactivated={onReactivated} onCancel={onCancel} />);
  return { onReactivated, onCancel };
}

function typeReason(value: string) {
  fireEvent.change(screen.getByLabelText('Motif (obligatoire)'), { target: { value } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Lever la suspension' }));
}

describe('ReactivateDialog', () => {
  beforeEach(() => {
    vi.mocked(reactivateAccount).mockReset();
    vi.mocked(reauthenticate).mockReset();
  });

  it('names the account in its title and keeps the lifting disabled until a reason is written', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Lever la suspension de @MarkL ?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lever la suspension' })).toBeDisabled();

    typeReason('   ');
    expect(screen.getByRole('button', { name: 'Lever la suspension' })).toBeDisabled();

    typeReason('Erreur de modération');
    expect(screen.getByRole('button', { name: 'Lever la suspension' })).toBeEnabled();
  });

  it('refuses a reason longer than the limit, and keeps the lifting disabled', () => {
    renderDialog();

    typeReason('a'.repeat(501));

    expect(screen.getByText('Le motif ne doit pas dépasser 500 caractères.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lever la suspension' })).toBeDisabled();
    expect(reactivateAccount).not.toHaveBeenCalled();
  });

  it('lifts the suspension with the trimmed reason and reports the result', async () => {
    vi.mocked(reactivateAccount).mockResolvedValue({ ok: true, status: 200, body: RESULT });
    const { onReactivated } = renderDialog();

    typeReason('  Erreur de modération ');
    submit();

    await waitFor(() => expect(onReactivated).toHaveBeenCalledWith(RESULT));
    expect(reactivateAccount).toHaveBeenCalledWith('account-1', 'Erreur de modération');
  });

  it('opens the re-authentication, then sends the lifting again once it is confirmed', async () => {
    vi.mocked(reactivateAccount)
      .mockResolvedValueOnce(REAUTH_REQUIRED)
      .mockResolvedValueOnce({ ok: true, status: 200, body: RESULT });
    vi.mocked(reauthenticate).mockResolvedValue({
      ok: true,
      status: 200,
      body: { reauthExpiresAt: '2026-10-21T12:10:00.000Z' },
    });
    const { onReactivated } = renderDialog();

    typeReason('Erreur de modération');
    submit();

    expect(await screen.findByRole('dialog', { name: 'Confirmer votre identité' })).toBeInTheDocument();
    expect(screen.getByText(/lever la suspension du compte de @MarkL/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Secret1234!' } });
    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(onReactivated).toHaveBeenCalledWith(RESULT));
    expect(reactivateAccount).toHaveBeenCalledTimes(2);
    expect(reactivateAccount).toHaveBeenLastCalledWith('account-1', 'Erreur de modération');
  });

  it('goes back to the reason, with the reason kept, when the re-authentication is cancelled', async () => {
    vi.mocked(reactivateAccount).mockResolvedValue(REAUTH_REQUIRED);
    renderDialog();

    typeReason('Erreur de modération');
    submit();

    await screen.findByRole('dialog', { name: 'Confirmer votre identité' });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(await screen.findByRole('dialog', { name: 'Lever la suspension de @MarkL ?' })).toBeInTheDocument();
    expect(screen.getByLabelText('Motif (obligatoire)')).toHaveValue('Erreur de modération');
    expect(reactivateAccount).toHaveBeenCalledTimes(1);
  });

  it('shows the API message for another refusal, and does not open the re-authentication', async () => {
    vi.mocked(reactivateAccount).mockResolvedValue({
      ok: false,
      problem: { status: 409, title: 'Conflit', detail: 'Le compte n’est pas suspendu.' },
    });
    const { onReactivated } = renderDialog();

    typeReason('Erreur de modération');
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Le compte n’est pas suspendu.');
    expect(screen.queryByRole('dialog', { name: 'Confirmer votre identité' })).not.toBeInTheDocument();
    expect(onReactivated).not.toHaveBeenCalled();
  });

  it('closes without sending anything when cancelled', () => {
    const { onCancel } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(reactivateAccount).not.toHaveBeenCalled();
  });
});
