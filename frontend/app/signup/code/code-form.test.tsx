import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resendSignupCode, verifySignup } from '@/lib/auth-api';
import { rememberPendingEmail, takePendingEmail } from '@/lib/pending-email';
import { CodeForm } from './code-form';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('@/lib/auth-api', () => ({ verifySignup: vi.fn(), resendSignupCode: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function typeCode(value: string) {
  fireEvent.change(screen.getByLabelText('Entrez le code reçu par e-mail'), { target: { value } });
}

describe('CodeForm', () => {
  beforeEach(() => {
    vi.mocked(verifySignup).mockReset();
    vi.mocked(resendSignupCode).mockReset();
    push.mockReset();
    window.sessionStorage.clear();
    rememberPendingEmail('alex@exemple.fr');
  });

  it('asks to start again when the signup page handed over no valid e-mail', async () => {
    window.sessionStorage.clear();
    render(<CodeForm />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Adresse e-mail manquante ou invalide.');
    expect(screen.getByRole('link', { name: 'Recommencer l’inscription' })).toHaveAttribute(
      'href',
      '/signup',
    );
    expect(screen.queryByRole('button', { name: 'Valider mon compte' })).not.toBeInTheDocument();
  });

  it('reads the e-mail once, even when React runs the effects twice (StrictMode)', async () => {
    vi.mocked(verifySignup).mockResolvedValue({ ok: true, status: 200, body: {} });
    render(
      <StrictMode>
        <CodeForm />
      </StrictMode>,
    );

    typeCode('648125');
    fireEvent.click(screen.getByRole('button', { name: 'Valider mon compte' }));

    await waitFor(() => expect(verifySignup).toHaveBeenCalledWith('alex@exemple.fr', '648125'));
  });

  it('rejects a code that is not six digits without calling the API', async () => {
    render(<CodeForm />);

    typeCode('12');
    fireEvent.click(screen.getByRole('button', { name: 'Valider mon compte' }));

    expect(await screen.findByText('Le code contient 6 chiffres.')).toBeInTheDocument();
    expect(screen.getByLabelText('Entrez le code reçu par e-mail')).toHaveFocus();
    expect(verifySignup).not.toHaveBeenCalled();
  });

  it('shows a wrong or expired code on the code field', async () => {
    vi.mocked(verifySignup).mockResolvedValue({
      ok: false,
      problem: {
        status: 422,
        title: 'Unprocessable Entity',
        detail: 'The code is incorrect or has expired.',
      },
    });
    render(<CodeForm />);

    typeCode('000000');
    fireEvent.click(screen.getByRole('button', { name: 'Valider mon compte' }));

    expect(
      await screen.findByText('Le code est incorrect ou a expiré. Demandez un nouveau code.'),
    ).toBeInTheDocument();
    expect(verifySignup).toHaveBeenCalledWith('alex@exemple.fr', '000000');
    expect(push).not.toHaveBeenCalled();
  });

  it('goes to the login page with a confirmation, handing the e-mail over outside the URL', async () => {
    vi.mocked(verifySignup).mockResolvedValue({ ok: true, status: 200, body: {} });
    render(<CodeForm />);

    typeCode('648125');
    fireEvent.click(screen.getByRole('button', { name: 'Valider mon compte' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?verified=1'));
    expect(takePendingEmail()).toBe('alex@exemple.fr');
  });

  it('sends a new code and confirms it without saying whether the address exists', async () => {
    vi.mocked(resendSignupCode).mockResolvedValue({ ok: true, status: 202, body: {} });
    render(<CodeForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Renvoyer le code' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Si cette adresse peut être utilisée, un nouveau code vient de vous être envoyé.',
    );
    expect(resendSignupCode).toHaveBeenCalledWith('alex@exemple.fr');
  });

  it('shows the wait of a refused resend', async () => {
    vi.mocked(resendSignupCode).mockResolvedValue({
      ok: false,
      problem: { status: 429, title: 'Too Many Requests', detail: 'Slow down.', retryAfterSeconds: 900 },
    });
    render(<CodeForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Renvoyer le code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Trop de tentatives. Réessayez dans 15 minutes.',
    );
  });
});
