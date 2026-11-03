import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession, type SessionUser } from '@/lib/auth-api';
import { SuspendedBanner } from './suspended-banner';

vi.mock('@/lib/auth-api', () => ({ getSession: vi.fn() }));

const SENTENCE = 'Pour toute question, contactez-nous à l’adresse indiquée dans les mentions légales.';
const RESTRICTIONS = 'Vous ne pouvez plus publier, réagir, répondre, suivre ni enregistrer\\.';

function answerWith(user: SessionUser) {
  vi.mocked(getSession).mockResolvedValue({ ok: true, status: 200, body: { user } });
}

/** Lets the session check of the banner finish. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('SuspendedBanner (section 3.4, section 12.6)', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReset();
  });

  it('shows nothing for an active account', async () => {
    answerWith({
      handle: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      status: 'active',
      suspensionReason: null,
    });

    const { container } = render(<SuspendedBanner />);
    await settle();

    expect(getSession).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing when the API cannot say, or when there is no session', async () => {
    vi.mocked(getSession).mockResolvedValue({
      ok: false,
      problem: { status: 0, title: 'Réseau', detail: 'Le serveur est injoignable.' },
    });

    const { container } = render(<SuspendedBanner />);
    await settle();

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the suspension sentence and the legal-notice sentence when no reason is given', async () => {
    answerWith({
      handle: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      status: 'suspended',
      suspensionReason: null,
    });

    render(<SuspendedBanner />);

    expect(await screen.findByText(/Votre compte est suspendu\./)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(RESTRICTIONS))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(SENTENCE))).toBeInTheDocument();
    expect(screen.queryByText(/Motif/)).not.toBeInTheDocument();
  });

  it('treats a blank reason as no reason', async () => {
    answerWith({
      handle: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      status: 'suspended',
      suspensionReason: '   ',
    });

    render(<SuspendedBanner />);

    expect(await screen.findByText(/Votre compte est suspendu\./)).toBeInTheDocument();
    expect(screen.queryByText(/Motif/)).not.toBeInTheDocument();
  });

  it('shows the reason of the suspension, as "Motif : {reason}" (DEC-077)', async () => {
    answerWith({
      handle: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      status: 'suspended',
      suspensionReason: 'Spam répété.',
    });

    render(<SuspendedBanner />);

    expect(await screen.findByText(/Votre compte est suspendu\. Motif : Spam répété\./)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(RESTRICTIONS))).toBeInTheDocument();
  });

  it('opens the contact form from the button, and closes it again', async () => {
    answerWith({
      handle: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      status: 'suspended',
      suspensionReason: null,
    });
    render(<SuspendedBanner />);
    const toggle = await screen.findByRole('button', { name: 'Contacter l’administrateur' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Votre message')).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText(
        'Expliquez votre situation : l’administrateur vous répond par e-mail, à l’adresse de votre compte.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Votre message')).toBeInTheDocument();
    expect(screen.getByText('0/1000')).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(screen.queryByLabelText('Votre message')).not.toBeInTheDocument());
  });
});
