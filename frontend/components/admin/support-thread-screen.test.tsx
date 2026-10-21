import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeSupportThread,
  getSupportThread,
  reauthenticate,
  replySupportThread,
  type SupportThreadDetail,
} from '@/lib/admin-api';
import { SupportThreadScreen } from './support-thread-screen';

vi.mock('@/lib/admin-api', () => ({
  getSupportThread: vi.fn(),
  replySupportThread: vi.fn(),
  closeSupportThread: vi.fn(),
  reauthenticate: vi.fn(),
}));

const THREAD_ID = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d';

const OPEN: SupportThreadDetail = {
  id: THREAD_ID,
  reference: 'CNT-20261018-0001',
  status: 'new',
  createdAt: '2026-10-18T14:22:00.000Z',
  closedAt: null,
  closedByLift: false,
  account: {
    id: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
    handle: 'MarkL',
    displayName: 'Mark',
    status: 'suspended',
    maskedEmail: 'm***@e***.test',
    createdAt: '2026-08-21T00:00:00.000Z',
    statusChangedAt: '2026-10-13T09:40:00.000Z',
    suspensionReason: 'Non-respect des règles de la communauté',
  },
  messages: [
    {
      id: 'm1',
      authorType: 'user',
      body: 'Pouvez-vous réexaminer ma situation ?',
      sentAt: '2026-10-18T14:22:00.000Z',
    },
  ],
};

const REPLIED: SupportThreadDetail = {
  ...OPEN,
  status: 'replied',
  messages: [
    ...OPEN.messages,
    {
      id: 'm2',
      authorType: 'admin',
      body: 'Votre suspension reste en place.',
      sentAt: '2026-10-19T10:30:00.000Z',
    },
  ],
};

const CLOSED: SupportThreadDetail = {
  ...REPLIED,
  status: 'closed',
  closedAt: '2026-10-21T12:00:00.000Z',
};

const REAUTH_REQUIRED = {
  ok: false as const,
  problem: {
    status: 403,
    title: 'Interdit',
    detail: 'Ré-authentification requise.',
    code: 'reauth_required',
  },
};

describe('SupportThreadScreen', () => {
  beforeEach(() => {
    vi.mocked(getSupportThread).mockReset();
    vi.mocked(replySupportThread).mockReset();
    vi.mocked(closeSupportThread).mockReset();
    vi.mocked(reauthenticate).mockReset();
  });

  it('shows the messages, the account with its masked address, and the answer form of an open thread', async () => {
    vi.mocked(getSupportThread).mockResolvedValue({ ok: true, status: 200, body: OPEN });
    render(<SupportThreadScreen id={THREAD_ID} />);

    expect(await screen.findByText('Pouvez-vous réexaminer ma situation ?')).toBeInTheDocument();
    expect(screen.getByText(/Message de @MarkL/)).toBeInTheDocument();
    expect(screen.getByText('Référence CNT-20261018-0001')).toBeInTheDocument();
    expect(screen.getByText('m***@e***.test')).toBeInTheDocument();
    expect(screen.getByText('Non-respect des règles de la communauté')).toBeInTheDocument();
    expect(screen.getByText('13/10/2026 11h40')).toBeInTheDocument();
    expect(screen.getByLabelText('Votre réponse')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir la fiche du compte' })).toHaveAttribute(
      'href',
      `/admin/users/${OPEN.account.id}`,
    );
  });

  it('keeps the send button disabled until an answer is written, and refuses an answer over 1000 characters', async () => {
    vi.mocked(getSupportThread).mockResolvedValue({ ok: true, status: 200, body: OPEN });
    render(<SupportThreadScreen id={THREAD_ID} />);
    const send = await screen.findByRole('button', { name: 'Envoyer la réponse' });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Votre réponse'), { target: { value: 'a'.repeat(1001) } });

    expect(screen.getByText('La réponse ne doit pas dépasser 1000 caractères.')).toBeInTheDocument();
    expect(send).toBeDisabled();
  });

  it('sends the answer, clears the field, and shows the thread with the new message', async () => {
    vi.mocked(getSupportThread).mockResolvedValue({ ok: true, status: 200, body: OPEN });
    vi.mocked(replySupportThread).mockResolvedValue({ ok: true, status: 200, body: REPLIED });
    render(<SupportThreadScreen id={THREAD_ID} />);
    await screen.findByText('Pouvez-vous réexaminer ma situation ?');

    fireEvent.change(screen.getByLabelText('Votre réponse'), {
      target: { value: '  Votre suspension reste en place. ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la réponse' }));

    expect(await screen.findByText('Votre suspension reste en place.')).toBeInTheDocument();
    expect(replySupportThread).toHaveBeenCalledWith(THREAD_ID, 'Votre suspension reste en place.');
    expect(screen.getByLabelText('Votre réponse')).toHaveValue('');
  });

  it('shows the API message when the answer is refused', async () => {
    vi.mocked(getSupportThread).mockResolvedValue({ ok: true, status: 200, body: OPEN });
    vi.mocked(replySupportThread).mockResolvedValue({
      ok: false,
      problem: { status: 409, title: 'Conflit', detail: 'Ce fil est fermé : aucune réponse n’est possible.' },
    });
    render(<SupportThreadScreen id={THREAD_ID} />);
    await screen.findByText('Pouvez-vous réexaminer ma situation ?');

    fireEvent.change(screen.getByLabelText('Votre réponse'), { target: { value: 'Bonjour' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la réponse' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ce fil est fermé : aucune réponse n’est possible.',
    );
  });

  it('closes the thread once confirmed, and then reads it only', async () => {
    vi.mocked(getSupportThread).mockResolvedValue({ ok: true, status: 200, body: REPLIED });
    vi.mocked(closeSupportThread).mockResolvedValueOnce(REAUTH_REQUIRED).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: CLOSED,
    });
    vi.mocked(reauthenticate).mockResolvedValue({
      ok: true,
      status: 200,
      body: { reauthExpiresAt: '2026-10-21T12:10:00.000Z' },
    });
    render(<SupportThreadScreen id={THREAD_ID} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Marquer comme traité' }));
    const closeDialog = screen.getByRole('dialog', { name: 'Marquer ce message comme traité ?' });
    fireEvent.click(within(closeDialog).getByRole('button', { name: 'Marquer comme traité' }));

    const dialog = await screen.findByRole('dialog', { name: 'Confirmer votre identité' });
    fireEvent.change(within(dialog).getByLabelText('Mot de passe'), { target: { value: 'Secret1234!' } });
    fireEvent.change(within(dialog).getByLabelText('Code à 6 chiffres'), { target: { value: '123456' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByText(/Fil fermé le 21\/10\/2026 14h00/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Votre réponse')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marquer comme traité' })).toBeDisabled();
    expect(closeSupportThread).toHaveBeenCalledTimes(2);
  });

  it('hides the answer form of a closed thread, and shows its closing date', async () => {
    vi.mocked(getSupportThread).mockResolvedValue({ ok: true, status: 200, body: CLOSED });
    render(<SupportThreadScreen id={THREAD_ID} />);

    expect(await screen.findByText(/aucune réponse n’est possible/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Envoyer la réponse' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marquer comme traité' })).toBeDisabled();
  });

  it('shows the API message when the thread cannot be read', async () => {
    vi.mocked(getSupportThread).mockResolvedValue({
      ok: false,
      problem: { status: 404, title: 'Introuvable', detail: 'Demande introuvable.' },
    });
    render(<SupportThreadScreen id={THREAD_ID} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Demande introuvable.');
  });
});
