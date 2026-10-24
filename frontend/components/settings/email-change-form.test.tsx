import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmEmailChange, requestEmailChange, resendEmailChange } from '@/lib/settings-api';
import { EmailChangeForm } from './email-change-form';

vi.mock('@/lib/settings-api', () => ({
  requestEmailChange: vi.fn(),
  resendEmailChange: vi.fn(),
  confirmEmailChange: vi.fn(),
}));

const OK = { ok: true as const, status: 202, body: undefined };

beforeEach(() => {
  vi.mocked(requestEmailChange).mockReset();
  vi.mocked(resendEmailChange).mockReset();
  vi.mocked(confirmEmailChange).mockReset();
});

async function sendAddress(newEmail: string, password: string) {
  fireEvent.change(screen.getByLabelText('Nouvelle adresse e-mail'), { target: { value: newEmail } });
  fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer le code' }));
}

describe('EmailChangeForm', () => {
  it('explains the change and sends the trimmed address with the password (202 moves to the code)', async () => {
    vi.mocked(requestEmailChange).mockResolvedValue(OK);
    render(<EmailChangeForm />);

    expect(screen.getByText(/Votre adresse actuelle recevra aussi un e-mail/)).toBeInTheDocument();
    await sendAddress('  nouvelle@example.test ', 'Ancien-mot-2!');

    expect(await screen.findByLabelText('Code à six chiffres')).toHaveAttribute('autocomplete', 'one-time-code');
    expect(requestEmailChange).toHaveBeenCalledWith('nouvelle@example.test', 'Ancien-mot-2!');
  });

  it('shows a wrong password under the form and stays on the address step', async () => {
    vi.mocked(requestEmailChange).mockResolvedValue({
      ok: false,
      problem: { status: 422, title: 'Mot de passe', detail: 'Le mot de passe est incorrect.' },
    });
    render(<EmailChangeForm />);

    await sendAddress('nouvelle@example.test', 'Mauvais-mot-2!');

    expect(await screen.findByRole('alert')).toHaveTextContent('Le mot de passe est incorrect.');
    expect(screen.getByLabelText('Nouvelle adresse e-mail')).toBeInTheDocument();
  });

  it('confirms the code and says the address was changed', async () => {
    vi.mocked(requestEmailChange).mockResolvedValue(OK);
    vi.mocked(confirmEmailChange).mockResolvedValue({ ok: true, status: 200, body: undefined });
    render(<EmailChangeForm />);
    await sendAddress('nouvelle@example.test', 'Ancien-mot-2!');

    fireEvent.change(await screen.findByLabelText('Code à six chiffres'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Votre adresse a été modifiée.');
    expect(confirmEmailChange).toHaveBeenCalledWith('123456');
  });

  it('shows the wrong or expired code message on a 422', async () => {
    vi.mocked(requestEmailChange).mockResolvedValue(OK);
    vi.mocked(confirmEmailChange).mockResolvedValue({
      ok: false,
      problem: { status: 422, title: 'Code', detail: 'Code.' },
    });
    render(<EmailChangeForm />);
    await sendAddress('nouvelle@example.test', 'Ancien-mot-2!');

    fireEvent.change(await screen.findByLabelText('Code à six chiffres'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Le code est incorrect ou a expiré.');
  });

  it('shows that the address is already used on a 409', async () => {
    vi.mocked(requestEmailChange).mockResolvedValue(OK);
    vi.mocked(confirmEmailChange).mockResolvedValue({ ok: false, problem: { status: 409, title: 'Pris', detail: 'Pris.' } });
    render(<EmailChangeForm />);
    await sendAddress('nouvelle@example.test', 'Ancien-mot-2!');

    fireEvent.change(await screen.findByLabelText('Code à six chiffres'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cette adresse e-mail est déjà utilisée.');
  });

  it('sends the code again, and says so', async () => {
    vi.mocked(requestEmailChange).mockResolvedValue(OK);
    vi.mocked(resendEmailChange).mockResolvedValue(OK);
    render(<EmailChangeForm />);
    await sendAddress('nouvelle@example.test', 'Ancien-mot-2!');

    fireEvent.click(await screen.findByRole('button', { name: 'Renvoyer le code' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Un nouveau code a été envoyé.');
  });

  it('shows the rate limit message when the resends are used up', async () => {
    vi.mocked(requestEmailChange).mockResolvedValue(OK);
    vi.mocked(resendEmailChange).mockResolvedValue({
      ok: false,
      problem: { status: 429, title: 'Trop', detail: 'Trop.', retryAfterSeconds: 120 },
    });
    render(<EmailChangeForm />);
    await sendAddress('nouvelle@example.test', 'Ancien-mot-2!');

    fireEvent.click(await screen.findByRole('button', { name: 'Renvoyer le code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Trop de tentatives. Réessayez dans 2 minutes.');
  });

  it('goes back to the address step with Changer d’adresse', async () => {
    vi.mocked(requestEmailChange).mockResolvedValue(OK);
    render(<EmailChangeForm />);
    await sendAddress('nouvelle@example.test', 'Ancien-mot-2!');

    fireEvent.click(await screen.findByRole('button', { name: 'Changer d’adresse' }));

    await waitFor(() => expect(screen.getByLabelText('Nouvelle adresse e-mail')).toBeInTheDocument());
  });
});
