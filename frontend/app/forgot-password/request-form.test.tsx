import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPasswordReset } from '@/lib/auth-api';
import { RequestForm } from './request-form';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/auth-api', () => ({ requestPasswordReset: vi.fn() }));

const ACCEPTED = { ok: true, status: 202, body: {} } as const;

function submitAddress(address: string) {
  fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: address } });
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer le code' }));
}

describe('RequestForm', () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(requestPasswordReset).mockReset();
  });

  it('refuses an address that is not an e-mail, without calling the API', () => {
    render(<RequestForm />);

    submitAddress('pas-une-adresse');

    expect(screen.getByText('Saisissez une adresse e-mail valide.')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse e-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it('sends the trimmed address and moves to the code step with the same answer for any account', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue(ACCEPTED);
    render(<RequestForm />);

    submitAddress('  marthe@example.fr ');

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/forgot-password/confirm?email=marthe%40example.fr'),
    );
    expect(requestPasswordReset).toHaveBeenCalledWith('marthe@example.fr');
  });

  it('shows the rate-limit message with the waiting time and stays on the step', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({
      ok: false,
      problem: { status: 429, title: 'Trop de demandes', detail: '', retryAfterSeconds: 600 },
    });
    render(<RequestForm />);

    submitAddress('marthe@example.fr');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Trop de demandes. Réessayez dans 10 minutes.',
    );
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Envoyer le code' })).toBeEnabled();
  });

  it('says the server cannot be reached when the request fails on the network', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({
      ok: false,
      problem: { status: 0, title: 'Réseau', detail: 'Le serveur est injoignable.' },
    });
    render(<RequestForm />);

    submitAddress('marthe@example.fr');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le serveur est injoignable. Réessayez dans quelques instants.',
    );
  });
});
