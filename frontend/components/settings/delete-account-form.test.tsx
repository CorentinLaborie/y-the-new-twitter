import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestAccountDeletion } from '@/lib/settings-api';
import { DeleteAccountForm } from './delete-account-form';

vi.mock('@/lib/settings-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/settings-api')>();
  return { ...actual, requestAccountDeletion: vi.fn() };
});

// jsdom does not implement the modal methods of <dialog>: the open state is kept on the attribute.
beforeAll(() => {
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
  }
  if (typeof HTMLDialogElement.prototype.close !== 'function') {
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  }
});

const PURGE_AT = '2027-01-21T10:00:00.000Z';

beforeEach(() => {
  vi.mocked(requestAccountDeletion).mockReset();
});

function fillForm({ password = 'Mon-mot-2!', reason = 'Spam', other = '', email = 'me@example.test' } = {}) {
  fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: password } });
  fireEvent.click(screen.getByLabelText(reason));
  if (reason === 'Autre') {
    fireEvent.change(screen.getByLabelText('Précisez le motif'), { target: { value: other } });
  }
  fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: email } });
}

describe('DeleteAccountForm', () => {
  it('shows the validated explanation, the reasons and the request button', () => {
    render(<DeleteAccountForm />);

    expect(screen.getByText(/Vos données sont conservées pendant 90 jours/)).toBeInTheDocument();
    for (const reason of ['Abus', 'Spam', 'Harcèlement', 'Usurpation d’identité', 'Autre']) {
      expect(screen.getByLabelText(reason)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Demander la suppression' })).toBeInTheDocument();
  });

  it('refuses a missing reason and a missing password, without a call', () => {
    render(<DeleteAccountForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Demander la suppression' }));

    expect(screen.getByText('Choisissez un motif.')).toBeInTheDocument();
    expect(screen.getByText('Saisissez votre mot de passe.')).toBeInTheDocument();
    expect(requestAccountDeletion).not.toHaveBeenCalled();
  });

  it('asks for the text of Autre before the confirmation', () => {
    render(<DeleteAccountForm />);
    fillForm({ reason: 'Autre', other: '   ' });

    fireEvent.click(screen.getByRole('button', { name: 'Demander la suppression' }));

    expect(screen.getByText('Précisez le motif pour continuer.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer mon compte' })).toBeNull();
  });

  it('opens the confirmation dialog with Annuler and Supprimer mon compte, and Annuler sends nothing', () => {
    render(<DeleteAccountForm />);
    fillForm();

    fireEvent.click(screen.getByRole('button', { name: 'Demander la suppression' }));
    expect(screen.getByRole('dialog', { name: 'Demander la suppression de votre compte ?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(requestAccountDeletion).not.toHaveBeenCalled();
  });

  it('sends the request, then shows the saved message, the purge date and the way to the login', async () => {
    vi.mocked(requestAccountDeletion).mockResolvedValue({ ok: true, status: 200, body: { deletionPurgeAt: PURGE_AT } });
    render(<DeleteAccountForm />);
    fillForm({ reason: 'Autre', other: '  Plus de temps  ', email: '  Me@Example.test ' });

    fireEvent.click(screen.getByRole('button', { name: 'Demander la suppression' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer mon compte' }));

    expect(await screen.findByText('Votre demande de suppression est enregistrée. Reconnectez-vous avant 90 jours pour l’annuler.')).toBeInTheDocument();
    expect(screen.getByText(/Date de purge prévue/)).toHaveTextContent('21 janvier 2027');
    expect(screen.getByRole('link', { name: 'Aller à la connexion' })).toHaveAttribute('href', '/login');
    expect(requestAccountDeletion).toHaveBeenCalledWith({
      password: 'Mon-mot-2!',
      reasonCode: 'other',
      otherReason: 'Plus de temps',
      email: 'Me@Example.test',
    });
  });

  it('shows the wrong password under the password field on a 422', async () => {
    vi.mocked(requestAccountDeletion).mockResolvedValue({
      ok: false,
      problem: { status: 422, title: 'Mot de passe', detail: 'Le mot de passe est incorrect.' },
    });
    render(<DeleteAccountForm />);
    fillForm();

    fireEvent.click(screen.getByRole('button', { name: 'Demander la suppression' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer mon compte' }));

    await waitFor(() => expect(screen.getByText('Le mot de passe est incorrect.')).toBeInTheDocument());
  });
});
