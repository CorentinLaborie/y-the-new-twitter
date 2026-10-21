import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reauthenticate, suspendAccount } from '@/lib/admin-api';
import { SuspendDialog } from './suspend-dialog';

vi.mock('@/lib/admin-api', () => ({ reauthenticate: vi.fn(), suspendAccount: vi.fn() }));

const RESULT = {
  id: 'account-1',
  status: 'suspended' as const,
  statusChangedAt: '2026-10-21T12:00:00.000Z',
  suspensionReason: 'Spam répété',
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
  const onSuspended = vi.fn();
  const onCancel = vi.fn();
  render(
    <SuspendDialog accountId="account-1" handle="MarkL" onSuspended={onSuspended} onCancel={onCancel} />,
  );
  return { onSuspended, onCancel };
}

function typeReason(value: string) {
  fireEvent.change(screen.getByLabelText('Motif (obligatoire)'), { target: { value } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Suspendre le compte' }));
}

describe('SuspendDialog', () => {
  beforeEach(() => {
    vi.mocked(suspendAccount).mockReset();
    vi.mocked(reauthenticate).mockReset();
  });

  it('keeps the suspension disabled until a reason is written', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Suspendre le compte' })).toBeDisabled();

    typeReason('   ');
    expect(screen.getByRole('button', { name: 'Suspendre le compte' })).toBeDisabled();

    typeReason('Spam répété');
    expect(screen.getByRole('button', { name: 'Suspendre le compte' })).toBeEnabled();
  });

  it('refuses a reason longer than the limit, and keeps the suspension disabled', () => {
    renderDialog();

    typeReason('a'.repeat(501));

    expect(screen.getByText('Le motif ne doit pas dépasser 500 caractères.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suspendre le compte' })).toBeDisabled();
    expect(suspendAccount).not.toHaveBeenCalled();
  });

  it('suspends with the trimmed reason and reports the result', async () => {
    vi.mocked(suspendAccount).mockResolvedValue({ ok: true, status: 200, body: RESULT });
    const { onSuspended } = renderDialog();

    typeReason('  Spam répété ');
    submit();

    await waitFor(() => expect(onSuspended).toHaveBeenCalledWith(RESULT));
    expect(suspendAccount).toHaveBeenCalledWith('account-1', 'Spam répété');
  });

  it('opens the re-authentication, then sends the suspension again once it is confirmed', async () => {
    vi.mocked(suspendAccount)
      .mockResolvedValueOnce(REAUTH_REQUIRED)
      .mockResolvedValueOnce({ ok: true, status: 200, body: RESULT });
    vi.mocked(reauthenticate).mockResolvedValue({
      ok: true,
      status: 200,
      body: { reauthExpiresAt: '2026-10-21T12:10:00.000Z' },
    });
    const { onSuspended } = renderDialog();

    typeReason('Spam répété');
    submit();

    expect(await screen.findByRole('dialog', { name: 'Confirmer votre identité' })).toBeInTheDocument();
    expect(screen.getByText(/suspendre le compte de @MarkL/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Secret1234!' } });
    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(onSuspended).toHaveBeenCalledWith(RESULT));
    expect(suspendAccount).toHaveBeenCalledTimes(2);
    expect(suspendAccount).toHaveBeenLastCalledWith('account-1', 'Spam répété');
  });

  it('goes back to the reason, with the reason kept, when the re-authentication is cancelled', async () => {
    vi.mocked(suspendAccount).mockResolvedValue(REAUTH_REQUIRED);
    renderDialog();

    typeReason('Spam répété');
    submit();

    await screen.findByRole('dialog', { name: 'Confirmer votre identité' });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(
      await screen.findByRole('dialog', { name: 'Suspendre le compte de @MarkL ?' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Motif (obligatoire)')).toHaveValue('Spam répété');
    expect(suspendAccount).toHaveBeenCalledTimes(1);
  });

  it('shows the API message for another refusal, and does not open the re-authentication', async () => {
    vi.mocked(suspendAccount).mockResolvedValue({
      ok: false,
      problem: { status: 409, title: 'Conflit', detail: 'Le compte est déjà suspendu.' },
    });
    const { onSuspended } = renderDialog();

    typeReason('Spam répété');
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Le compte est déjà suspendu.');
    expect(screen.queryByRole('dialog', { name: 'Confirmer votre identité' })).not.toBeInTheDocument();
    expect(onSuspended).not.toHaveBeenCalled();
  });
});
