import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reauthenticate } from '@/lib/admin-api';
import { ReauthDialog } from './reauth-dialog';

vi.mock('@/lib/admin-api', () => ({ reauthenticate: vi.fn() }));

function renderDialog() {
  const onConfirmed = vi.fn();
  const onCancel = vi.fn();
  render(
    <ReauthDialog
      actionLabel="suspendre le compte de @MarkL"
      onConfirmed={onConfirmed}
      onCancel={onCancel}
    />,
  );
  return { onConfirmed, onCancel };
}

function fill(password: string) {
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: password } });
}

describe('ReauthDialog', () => {
  beforeEach(() => {
    vi.mocked(reauthenticate).mockReset();
  });

  it('names the action and asks for the password only, in a labelled dialog', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Confirmer votre identité' })).toBeInTheDocument();
    expect(screen.getByText(/Action demandée : suspendre le compte de @MarkL/)).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.queryByLabelText('Code à 6 chiffres')).not.toBeInTheDocument();
  });

  it('does not call the API while the password is empty', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(reauthenticate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Saisissez votre mot de passe.');
  });

  it('confirms once the API accepts the password', async () => {
    vi.mocked(reauthenticate).mockResolvedValue({
      ok: true,
      status: 200,
      body: { reauthExpiresAt: '2026-10-21T12:10:00.000Z' },
    });
    const { onConfirmed } = renderDialog();

    fill('Secret1234!');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(reauthenticate).toHaveBeenCalledWith('Secret1234!');
  });

  it('shows the API message for a wrong password, and does not confirm', async () => {
    vi.mocked(reauthenticate).mockResolvedValue({
      ok: false,
      problem: { status: 401, title: 'Erreur', detail: 'Identifiants incorrects' },
    });
    const { onConfirmed } = renderDialog();

    fill('Mauvais1234!');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Identifiants incorrects');
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
