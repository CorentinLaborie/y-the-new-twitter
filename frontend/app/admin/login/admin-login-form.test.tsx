import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminLogin } from '@/lib/admin-api';
import { CODE_REQUIRED_MESSAGE, SETUP_REQUIRED_MESSAGE } from '@/lib/admin-login';
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

  it('does not call the API while a field is empty, and marks the e-mail field', () => {
    render(<AdminLoginForm />);

    submit();

    expect(adminLogin).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Adresse e-mail')).toHaveAttribute('aria-invalid', 'true');
  });

  it('asks for the second factor when the password is right and no code was sent', async () => {
    vi.mocked(adminLogin).mockResolvedValue({ ok: true, status: 200, body: { status: 'code_required' } });
    render(<AdminLoginForm />);

    fillCredentials();
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(CODE_REQUIRED_MESSAGE);
    expect(adminLogin).toHaveBeenCalledWith('admin@example.test', 'Secret1234!', undefined);
    expect(push).not.toHaveBeenCalled();
  });

  it('sends the code with the password and opens the console on a full sign-in', async () => {
    vi.mocked(adminLogin).mockResolvedValue({
      ok: true,
      status: 200,
      body: { status: 'ok', user: { handle: 'admin', displayName: 'Administrateur' } },
    });
    render(<AdminLoginForm />);

    fillCredentials();
    fireEvent.change(screen.getByLabelText('Code de vérification à 6 chiffres'), {
      target: { value: '123456' },
    });
    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin'));
    expect(adminLogin).toHaveBeenCalledWith('admin@example.test', 'Secret1234!', '123456');
  });

  it('shows the API message for a wrong code, and keeps the form open', async () => {
    vi.mocked(adminLogin).mockResolvedValue({
      ok: false,
      problem: { status: 401, title: 'Erreur', detail: 'Code de vérification incorrect.' },
    });
    render(<AdminLoginForm />);

    fillCredentials();
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Code de vérification incorrect.');
    expect(screen.getByLabelText('Mot de passe')).toBeEnabled();
  });

  it('locks every field for the Retry-After delay after too many failures', async () => {
    vi.mocked(adminLogin).mockResolvedValue({
      ok: false,
      problem: { status: 429, title: 'Trop', detail: 'Trop.', retryAfterSeconds: 892 },
    });
    render(<AdminLoginForm />);

    fillCredentials();
    submit();

    expect(await screen.findByText('Connexion bloquée')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Réessayez dans 14 min 52 s.');
    expect(screen.getByLabelText('Mot de passe')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeDisabled();
  });

  it('explains that the second factor must be set up first', async () => {
    vi.mocked(adminLogin).mockResolvedValue({ ok: true, status: 200, body: { status: 'setup_required' } });
    render(<AdminLoginForm />);

    fillCredentials();
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(SETUP_REQUIRED_MESSAGE);
    expect(push).not.toHaveBeenCalled();
  });
});
