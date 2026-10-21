import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAccount, reauthenticate } from '@/lib/admin-api';
import { DeleteAccountDialog } from './delete-account-dialog';

vi.mock('@/lib/admin-api', () => ({ reauthenticate: vi.fn(), deleteAccount: vi.fn() }));

const RESULT = {
  id: 'account-1',
  status: 'pending_deletion' as const,
  statusChangedAt: '2026-10-21T12:00:00.000Z',
  suspensionReason: null,
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

function renderDialog() {
  const onDeleted = vi.fn();
  const onCancel = vi.fn();
  render(
    <DeleteAccountDialog accountId="account-1" handle="MarkL" onDeleted={onDeleted} onCancel={onCancel} />,
  );
  return { onDeleted, onCancel };
}

function chooseReason(label: string) {
  fireEvent.change(screen.getByLabelText('Motif (obligatoire)'), { target: { value: label } });
}

function submitButton() {
  return screen.getByRole('button', { name: 'Supprimer le compte' });
}

describe('DeleteAccountDialog', () => {
  beforeEach(() => {
    vi.mocked(deleteAccount).mockReset();
    vi.mocked(reauthenticate).mockReset();
  });

  it('lists the reasons, and keeps the deletion disabled until one is picked', () => {
    renderDialog();

    expect(screen.getByRole('option', { name: 'Usurpation d’identité' })).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();

    chooseReason('spam');
    expect(submitButton()).toBeEnabled();
  });

  it('deletes with the listed reason, without a text, and reports the result', async () => {
    vi.mocked(deleteAccount).mockResolvedValue({ ok: true, status: 200, body: RESULT });
    const { onDeleted } = renderDialog();

    chooseReason('spam');
    fireEvent.click(submitButton());

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(RESULT));
    expect(deleteAccount).toHaveBeenCalledWith('account-1', 'spam', undefined);
  });

  it('asks for a text with "Autre", and keeps the deletion disabled while it is blank', () => {
    renderDialog();

    chooseReason('other');

    expect(screen.getByLabelText('Précisez le motif')).toBeInTheDocument();
    expect(screen.getByText('Précisez le motif de la suppression.')).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Précisez le motif'), { target: { value: '   ' } });
    expect(submitButton()).toBeDisabled();
  });

  it('refuses a text longer than the limit with "Autre"', () => {
    renderDialog();

    chooseReason('other');
    fireEvent.change(screen.getByLabelText('Précisez le motif'), { target: { value: 'a'.repeat(501) } });

    expect(screen.getByText('Le motif ne doit pas dépasser 500 caractères.')).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it('sends the trimmed free text with "Autre"', async () => {
    vi.mocked(deleteAccount).mockResolvedValue({ ok: true, status: 200, body: RESULT });
    renderDialog();

    chooseReason('other');
    fireEvent.change(screen.getByLabelText('Précisez le motif'), { target: { value: '  Compte piraté ' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('account-1', 'other', 'Compte piraté'));
  });

  it('opens the re-authentication, then sends the deletion again once it is confirmed', async () => {
    vi.mocked(deleteAccount)
      .mockResolvedValueOnce(REAUTH_REQUIRED)
      .mockResolvedValueOnce({ ok: true, status: 200, body: RESULT });
    vi.mocked(reauthenticate).mockResolvedValue({
      ok: true,
      status: 200,
      body: { reauthExpiresAt: '2026-10-21T12:10:00.000Z' },
    });
    const { onDeleted } = renderDialog();

    chooseReason('harassment');
    fireEvent.click(submitButton());

    expect(await screen.findByRole('dialog', { name: 'Confirmer votre identité' })).toBeInTheDocument();
    expect(screen.getByText(/supprimer le compte de @MarkL/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Secret1234!' } });
    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(RESULT));
    expect(deleteAccount).toHaveBeenCalledTimes(2);
    expect(deleteAccount).toHaveBeenLastCalledWith('account-1', 'harassment', undefined);
  });

  it('goes back to the form, with the reason kept, when the re-authentication is cancelled', async () => {
    vi.mocked(deleteAccount).mockResolvedValue(REAUTH_REQUIRED);
    renderDialog();

    chooseReason('abuse');
    fireEvent.click(submitButton());

    await screen.findByRole('dialog', { name: 'Confirmer votre identité' });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(
      await screen.findByRole('dialog', { name: 'Supprimer le compte de @MarkL ?' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Motif (obligatoire)')).toHaveValue('abuse');
    expect(deleteAccount).toHaveBeenCalledTimes(1);
  });

  it('shows the API message for another refusal, and does not open the re-authentication', async () => {
    vi.mocked(deleteAccount).mockResolvedValue({
      ok: false,
      problem: { status: 409, title: 'Conflit', detail: 'La suppression n’est pas possible pour ce compte.' },
    });
    const { onDeleted } = renderDialog();

    chooseReason('spam');
    fireEvent.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La suppression n’est pas possible pour ce compte.',
    );
    expect(screen.queryByRole('dialog', { name: 'Confirmer votre identité' })).not.toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('closes without a call when the administrator cancels', () => {
    const { onCancel } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});
