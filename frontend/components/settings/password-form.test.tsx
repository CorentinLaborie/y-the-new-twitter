import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changePassword } from '@/lib/settings-api';
import { PasswordForm } from './password-form';

vi.mock('@/lib/settings-api', () => ({ changePassword: vi.fn() }));

const OLD = 'Ancien-mot-2!';
const NEW = 'Nouveau-mot-3!';
const PASSWORD_REFUSED =
  'Le mot de passe doit contenir de 8 à 128 caractères, dont au moins un chiffre et un caractère spécial.';

function fill(current: string, next: string, confirmation: string) {
  fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), { target: { value: confirmation } });
}

beforeEach(() => {
  vi.mocked(changePassword).mockReset();
});

describe('PasswordForm', () => {
  it('asks for the current password, and refuses an empty one without any call', () => {
    render(<PasswordForm />);
    fill('', NEW, NEW);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(screen.getByText('Saisissez votre mot de passe actuel.')).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('refuses a confirmation that does not match, under the confirmation, without any call', () => {
    render(<PasswordForm />);
    fill(OLD, NEW, 'Autre-mot-4!');

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(screen.getByText('Les deux mots de passe ne correspondent pas.')).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('checks the policy of the new password before sending it', () => {
    render(<PasswordForm />);
    fill(OLD, 'court', 'court');

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(screen.getByText('Le mot de passe doit contenir au moins 8 caractères.')).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('sends the two passwords, clears the fields and says the password was changed', async () => {
    vi.mocked(changePassword).mockResolvedValue({ ok: true, status: 204, body: undefined });
    render(<PasswordForm />);
    fill(OLD, NEW, NEW);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Votre mot de passe a été modifié.');
    expect(changePassword).toHaveBeenCalledWith(OLD, NEW);
    expect(screen.getByLabelText('Mot de passe actuel')).toHaveValue('');
    expect(screen.getByLabelText('Nouveau mot de passe')).toHaveValue('');
  });

  it('accepts a new password equal to the old one (decision 2)', async () => {
    vi.mocked(changePassword).mockResolvedValue({ ok: true, status: 204, body: undefined });
    render(<PasswordForm />);
    fill(OLD, OLD, OLD);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Votre mot de passe a été modifié.');
  });

  it('shows a wrong current password under the current field', async () => {
    vi.mocked(changePassword).mockResolvedValue({
      ok: false,
      problem: { status: 422, title: 'Mot de passe', detail: 'Le mot de passe est incorrect.' },
    });
    render(<PasswordForm />);
    fill(OLD, NEW, NEW);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Le mot de passe est incorrect.')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe actuel')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a refused policy under the new password field', async () => {
    vi.mocked(changePassword).mockResolvedValue({
      ok: false,
      problem: { status: 422, title: 'Mot de passe', detail: PASSWORD_REFUSED },
    });
    render(<PasswordForm />);
    fill(OLD, NEW, NEW);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(PASSWORD_REFUSED)).toBeInTheDocument();
    expect(screen.getByLabelText('Nouveau mot de passe')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the rate limit message on a 429', async () => {
    vi.mocked(changePassword).mockResolvedValue({
      ok: false,
      problem: { status: 429, title: 'Trop', detail: 'Trop.', retryAfterSeconds: 60 },
    });
    render(<PasswordForm />);
    fill(OLD, NEW, NEW);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Trop de tentatives. Réessayez dans 1 minute.');
  });

  it('disables the button while the change is sent', async () => {
    let finish: (value: { ok: true; status: 204; body: undefined }) => void = () => undefined;
    vi.mocked(changePassword).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<PasswordForm />);
    fill(OLD, NEW, NEW);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled());
    finish({ ok: true, status: 204, body: undefined });
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('links the forgotten password page', () => {
    render(<PasswordForm />);

    expect(screen.getByRole('link', { name: 'Mot de passe oublié ?' })).toHaveAttribute('href', '/forgot-password');
  });
});
