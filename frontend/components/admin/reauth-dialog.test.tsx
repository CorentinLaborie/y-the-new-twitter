import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reauthenticate } from '@/lib/admin-api';
import { ReauthDialog } from './reauth-dialog';

vi.mock('@/lib/admin-api', () => ({ reauthenticate: vi.fn() }));

function renderDialog() {
  const onConfirmed = vi.fn();
  const onCancel = vi.fn();
  render(<ReauthDialog actionLabel="suspendre le compte de @MarkL" onConfirmed={onConfirmed} onCancel={onCancel} />);
  return { onConfirmed, onCancel };
}

function fill(password: string, code: string) {
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: code } });
}

describe('ReauthDialog', () => {
  beforeEach(() => {
    vi.mocked(reauthenticate).mockReset();
  });

  it('names the action and asks for the password and the code in a labelled dialog', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Confirmer votre identité' })).toBeInTheDocument();
    expect(screen.getByText(/Action demandée : suspendre le compte de @MarkL/)).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('Code à 6 chiffres')).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('does not call the API while the password or the code is empty', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(reauthenticate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Saisissez votre mot de passe et le code de vérification.');
  });

  it('confirms once the API accepts the password and the code, with the code trimmed', async () => {
    vi.mocked(reauthenticate).mockResolvedValue({
      ok: true,
      status: 200,
      body: { reauthExpiresAt: '2026-10-21T12:10:00.000Z' },
    });
    const { onConfirmed } = renderDialog();

    fill('Secret1234!', ' 123456 ');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(reauthenticate).toHaveBeenCalledWith('Secret1234!', '123456');
  });

  it('shows the API message for a wrong code, and does not confirm', async () => {
    vi.mocked(reauthenticate).mockResolvedValue({
      ok: false,
      problem: { status: 401, title: 'Erreur', detail: 'Code de vérification incorrect.' },
    });
    const { onConfirmed } = renderDialog();

    fill('Secret1234!', '000000');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Code de vérification incorrect.');
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Mot de passe')).toBeEnabled();
  });

  it('closes with Cancel and with Escape', () => {
    const { onCancel } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
