import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmPasswordReset } from '@/lib/auth-api';
import { ConfirmForm } from './confirm-form';

vi.mock('@/lib/auth-api', () => ({ confirmPasswordReset: vi.fn() }));

const EMAIL = 'marthe@example.fr';

function fillAndSubmit(code: string, password: string) {
  fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: code } });
  fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Changer mon mot de passe' }));
}

describe('ConfirmForm', () => {
  beforeEach(() => {
    vi.mocked(confirmPasswordReset).mockReset();
  });

  it('repeats the same confirmation message as the request step', () => {
    render(<ConfirmForm email={EMAIL} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Si cette adresse peut être utilisée, un code vient de vous être envoyé.',
    );
  });

  it('refuses a code that is not six digits, without calling the API', () => {
    render(<ConfirmForm email={EMAIL} />);

    fillAndSubmit('12345', 'abcdef1!');

    expect(screen.getByText('Le code contient six chiffres.')).toBeInTheDocument();
    expect(screen.getByLabelText('Code à 6 chiffres')).toHaveAttribute('aria-invalid', 'true');
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('applies the signup password policy and names the first rule broken', () => {
    render(<ConfirmForm email={EMAIL} />);

    fillAndSubmit('123456', 'abcdefg!');

    expect(screen.getByText('Le mot de passe doit contenir au moins un chiffre.')).toBeInTheDocument();
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('sends the e-mail, the code and the new password, then confirms the change', async () => {
    vi.mocked(confirmPasswordReset).mockResolvedValue({ ok: true, status: 200, body: {} });
    render(<ConfirmForm email={EMAIL} />);

    fillAndSubmit('123456', 'abcdef1!');

    expect(await screen.findByText('Votre mot de passe a été changé.')).toBeInTheDocument();
    expect(confirmPasswordReset).toHaveBeenCalledWith(EMAIL, '123456', 'abcdef1!');
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login');
  });

  it('explains a wrong or expired code and offers a new one', async () => {
    vi.mocked(confirmPasswordReset).mockResolvedValue({
      ok: false,
      problem: { status: 422, title: 'Code invalide', detail: '' },
    });
    render(<ConfirmForm email={EMAIL} />);

    fillAndSubmit('654321', 'abcdef1!');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Le code est incorrect ou expiré, ou le mot de passe n’est pas accepté.');
    expect(screen.getByRole('link', { name: 'Demander un nouveau code' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('shows the new password when asked, and hides it again', async () => {
    render(<ConfirmForm email={EMAIL} />);
    const passwordField = screen.getByLabelText('Nouveau mot de passe');

    expect(passwordField).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Afficher' }));
    await waitFor(() => expect(passwordField).toHaveAttribute('type', 'text'));
    fireEvent.click(screen.getByRole('button', { name: 'Masquer' }));
    expect(passwordField).toHaveAttribute('type', 'password');
  });
});
