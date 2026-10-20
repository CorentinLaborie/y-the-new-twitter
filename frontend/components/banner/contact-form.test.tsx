import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactForm } from './contact-form';
import { sendContactMessage } from './contact-message';

vi.mock('./contact-message', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./contact-message')>()),
  sendContactMessage: vi.fn(),
}));

function typeText(text: string) {
  fireEvent.change(screen.getByLabelText('Votre message'), { target: { value: text } });
}

function counter() {
  return screen.getByText(/^\d+\/1000$/);
}

function sendButton() {
  return screen.getByRole('button', { name: 'Envoyer le message' });
}

describe('ContactForm (section 3.4, DEC-078)', () => {
  beforeEach(() => {
    vi.mocked(sendContactMessage).mockReset();
  });

  it('starts empty, with the hint, the counter at 0 out of 1000, and the button off', () => {
    render(<ContactForm />);

    expect(screen.getByText('1 000 caractères maximum.')).toBeInTheDocument();
    expect(counter()).toHaveTextContent('0/1000');
    expect(sendButton()).toBeDisabled();
  });

  it('keeps the button off for spaces only', () => {
    render(<ContactForm />);

    typeText('   ');

    expect(sendButton()).toBeDisabled();
  });

  it('accepts exactly 1000 characters: no refusal, and the button is on', () => {
    render(<ContactForm />);

    typeText('a'.repeat(1000));

    expect(counter()).toHaveTextContent('1000/1000');
    expect(counter()).not.toHaveAttribute('data-over');
    expect(screen.queryByText('Votre message dépasse 1000 caractères.')).not.toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
  });

  it('refuses 1001 characters: the counter is marked, the refusal is shown and the button stays off', () => {
    render(<ContactForm />);

    typeText('a'.repeat(1001));

    expect(counter()).toHaveTextContent('1001/1000');
    expect(counter()).toHaveAttribute('data-over', 'true');
    expect(screen.getByText('Votre message dépasse 1000 caractères.')).toBeInTheDocument();
    expect(screen.getByLabelText('Votre message')).toHaveAttribute('aria-invalid', 'true');
    expect(sendButton()).toBeDisabled();
  });

  it('sends the text, then shows the success message with the reference', async () => {
    vi.mocked(sendContactMessage).mockResolvedValue({ ok: true, reference: 'CNT-20261019-0418' });
    render(<ContactForm />);

    typeText('  Je conteste la suspension.  ');
    fireEvent.click(sendButton());

    await waitFor(() => expect(screen.getByText('Message envoyé')).toBeInTheDocument());
    expect(sendContactMessage).toHaveBeenCalledWith('  Je conteste la suspension.  ');
    expect(screen.getByText('Référence : CNT-20261019-0418')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Votre message a bien été transmis à l’administrateur\. La réponse sera envoyée par e-mail/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Votre message')).not.toBeInTheDocument();
  });

  it('keeps the text and shows the generic error when the send fails', async () => {
    vi.mocked(sendContactMessage).mockResolvedValue({
      ok: false,
      problem: { status: 500, title: 'Erreur', detail: 'Une erreur est survenue.' },
    });
    render(<ContactForm />);

    typeText('Mon message');
    fireEvent.click(sendButton());

    expect(await screen.findByText(/Votre message n’a pas été envoyé/)).toBeInTheDocument();
    expect(screen.getByLabelText('Votre message')).toHaveValue('Mon message');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows the French text of a known refusal code', async () => {
    vi.mocked(sendContactMessage).mockResolvedValue({
      ok: false,
      problem: { status: 403, title: 'Forbidden', detail: 'Accès refusé.', code: 'csrf_invalid' },
    });
    render(<ContactForm />);

    typeText('Mon message');
    fireEvent.click(sendButton());

    expect(await screen.findByText('Jeton de sécurité absent ou invalide.')).toBeInTheDocument();
  });
});
