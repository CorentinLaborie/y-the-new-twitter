import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeSupportThread, reauthenticate } from '@/lib/admin-api';
import { CloseThreadDialog } from './close-thread-dialog';

vi.mock('@/lib/admin-api', () => ({ closeSupportThread: vi.fn(), reauthenticate: vi.fn() }));

const THREAD_ID = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d';

const CLOSED = {
  id: THREAD_ID,
  reference: 'CNT-20261018-0001',
  status: 'closed' as const,
  createdAt: '2026-10-18T14:22:00.000Z',
  closedAt: '2026-10-21T12:00:00.000Z',
  closedByLift: false,
  account: {
    id: 'account-1',
    handle: 'MarkL',
    displayName: 'Mark',
    status: 'suspended' as const,
    maskedEmail: 'm***@e***.test',
    createdAt: '2026-08-21T00:00:00.000Z',
    statusChangedAt: null,
    suspensionReason: null,
  },
  messages: [],
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

describe('CloseThreadDialog', () => {
  it('names only the password in the sensitive-action notice', () => {
    render(<CloseThreadDialog threadId={THREAD_ID} onClosed={vi.fn()} onCancel={vi.fn()} />);

    expect(
      screen.getByText('Action sensible : confirmation par mot de passe requise à l’étape suivante.'),
    ).toBeInTheDocument();
  });

  beforeEach(() => {
    vi.mocked(closeSupportThread).mockReset();
    vi.mocked(reauthenticate).mockReset();
  });

  it('says that nothing is sent, and closes the thread once confirmed', async () => {
    vi.mocked(closeSupportThread).mockResolvedValue({ ok: true, status: 200, body: CLOSED });
    const onClosed = vi.fn();
    render(<CloseThreadDialog threadId={THREAD_ID} onClosed={onClosed} onCancel={vi.fn()} />);

    expect(screen.getByText(/aucun e-mail n’est envoyé/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Marquer comme traité' }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledWith(CLOSED));
    expect(closeSupportThread).toHaveBeenCalledWith(THREAD_ID);
  });

  it('opens the re-authentication, then closes the thread again once it is confirmed', async () => {
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
    const onClosed = vi.fn();
    render(<CloseThreadDialog threadId={THREAD_ID} onClosed={onClosed} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Marquer comme traité' }));

    expect(await screen.findByRole('dialog', { name: 'Confirmer votre identité' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Secret1234!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledWith(CLOSED));
    expect(closeSupportThread).toHaveBeenCalledTimes(2);
  });

  it('shows the API message when the thread is already closed', async () => {
    vi.mocked(closeSupportThread).mockResolvedValue({
      ok: false,
      problem: { status: 409, title: 'Conflit', detail: 'Ce fil est déjà fermé.' },
    });
    const onClosed = vi.fn();
    render(<CloseThreadDialog threadId={THREAD_ID} onClosed={onClosed} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Marquer comme traité' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce fil est déjà fermé.');
    expect(onClosed).not.toHaveBeenCalled();
  });
});
