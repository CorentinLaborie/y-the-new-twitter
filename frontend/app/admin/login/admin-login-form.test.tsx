import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminLogin } from '@/lib/admin-api';
import { AdminLoginForm } from './admin-login-form';

const push = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/admin-api', () => ({ adminLogin: vi.fn() }));

function fillCredentials() {
  fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: 'admin@example.test' } });
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Secret1234!' } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
}

describe('AdminLoginForm', () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(adminLogin).mockReset();
  });

  it('has no second-factor field', () => {
    render(<AdminLoginForm />);

    expect(screen.queryByLabelText('Code de vérification à 6 chiffres')).not.toBeInTheDocument();
  });

  it('does not call the API while a field is empty, and marks the e-mail field', () => {
    render(<AdminLoginForm />);

    submit();

    expect(adminLogin).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Adresse e-mail')).toHaveAttribute('aria-invalid', 'true');
  });

  it('signs in with the email and the password, and opens the console', async () => {
    vi.mocked(adminLogin).mockResolvedValue({
      ok: true,
      status: 200,
      body: { status: 'ok', user: { handle: 'admin', displayName: 'Administrateur', avatarUrl: null } },
    });
    render(<AdminLoginForm />);

    fillCredentials();
    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin'));
    expect(adminLogin).toHaveBeenCalledWith('admin@example.test', 'Secret1234!');
  });

  it('shows the API message for a refused sign-in, and keeps the user on the page', async () => {
    vi.mocked(adminLogin).mockResolvedValue({
      ok: false,
      problem: { status: 401, title: 'Erreur', detail: 'Identifiants incorrects' },
    });
    render(<AdminLoginForm />);

    fillCredentials();
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Identifiants incorrects');
    expect(push).not.toHaveBeenCalled();
  });

  it('locks the form for the delay of a 429 answer', async () => {
    vi.mocked(adminLogin).mockResolvedValue({
      ok: false,
      problem: { status: 429, title: 'Trop de tentatives', detail: 'Verrouillé.', retryAfterSeconds: 892 },
    });
    render(<AdminLoginForm />);

    fillCredentials();
    submit();

    expect(await screen.findByText('Connexion bloquée')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeDisabled();
  });
});
