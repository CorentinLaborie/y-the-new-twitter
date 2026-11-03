import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listSupportThreads, type SupportThreadListItem } from '@/lib/admin-api';
import { SupportScreen } from './support-screen';

vi.mock('@/lib/admin-api', () => ({ listSupportThreads: vi.fn() }));

const THREAD: SupportThreadListItem = {
  id: '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d',
  reference: 'CNT-20261018-0001',
  status: 'new',
  receivedAt: '2026-10-18T14:22:00.000Z',
  latestMessage: 'Je pense que la suspension de mon compte est une erreur.',
  account: {
    id: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
    handle: 'MarkL',
    displayName: 'Mark',
    avatarUrl: null,
    status: 'suspended',
    maskedEmail: 'm***@e***.test',
    createdAt: '2026-08-21T00:00:00.000Z',
  },
};

const CLOSED: SupportThreadListItem = {
  ...THREAD,
  id: '7b8c9d0e-1f2a-4b3c-9d4e-5f6a7b8c9d0e',
  status: 'closed',
  latestMessage: null,
  receivedAt: null,
  account: { ...THREAD.account, handle: 'Lucas_R', status: 'active' },
};

function table() {
  return screen.getByRole('table', { name: 'Messages reçus' });
}

describe('SupportScreen', () => {
  beforeEach(() => {
    vi.mocked(listSupportThreads).mockReset();
  });

  it('lists the messages with the date, the account and its status, the message and the status of the thread', async () => {
    vi.mocked(listSupportThreads).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [THREAD], nextCursor: null },
    });
    render(<SupportScreen />);

    const link = await screen.findByRole('link', { name: '@MarkL' });
    expect(link).toHaveAttribute('href', `/admin/support/${THREAD.id}`);
    expect(within(table()).getByText('18/10/2026 16h22')).toBeInTheDocument();
    expect(within(table()).getByText('CNT-20261018-0001')).toBeInTheDocument();
    expect(within(table()).getByText('Suspendu')).toBeInTheDocument();
    expect(
      within(table()).getByText('Je pense que la suspension de mon compte est une erreur.'),
    ).toBeInTheDocument();
    expect(within(table()).getByText('Nouveau')).toBeInTheDocument();
    expect(listSupportThreads).toHaveBeenCalledWith({ status: undefined, cursor: undefined, limit: 20 });
  });

  it('shows a dash for a thread without a message of the account, and the closed status', async () => {
    vi.mocked(listSupportThreads).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [CLOSED], nextCursor: null },
    });
    render(<SupportScreen />);

    expect(await screen.findByText('Traité')).toBeInTheDocument();
    expect(within(table()).getAllByText('—')).toHaveLength(2);
    expect(within(table()).getByText('Actif')).toBeInTheDocument();
  });

  it('restarts the list when the status filter changes', async () => {
    vi.mocked(listSupportThreads).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [THREAD], nextCursor: null },
    });
    render(<SupportScreen />);
    await screen.findByRole('link', { name: '@MarkL' });

    fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'closed' } });

    await waitFor(() =>
      expect(listSupportThreads).toHaveBeenLastCalledWith({ status: 'closed', cursor: undefined, limit: 20 }),
    );
  });

  it('appends the next page, with the filter of the list', async () => {
    vi.mocked(listSupportThreads)
      .mockResolvedValueOnce({ ok: true, status: 200, body: { items: [THREAD], nextCursor: 'cursor-1' } })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { items: [CLOSED], nextCursor: null } });
    render(<SupportScreen />);
    await screen.findByRole('link', { name: '@MarkL' });

    fireEvent.click(screen.getByRole('button', { name: 'Charger plus de messages' }));

    expect(await screen.findByRole('link', { name: '@Lucas_R' })).toBeInTheDocument();
    expect(listSupportThreads).toHaveBeenLastCalledWith({ status: undefined, cursor: 'cursor-1', limit: 20 });
  });

  it('says when no message matches the filter', async () => {
    vi.mocked(listSupportThreads).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [], nextCursor: null },
    });
    render(<SupportScreen />);

    expect(await screen.findByText('Aucun message ne correspond à ce filtre.')).toBeInTheDocument();
  });

  it('shows the API message when the list cannot be read', async () => {
    vi.mocked(listSupportThreads).mockResolvedValue({
      ok: false,
      problem: { status: 500, title: 'Erreur', detail: 'Le service est indisponible.' },
    });
    render(<SupportScreen />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Le service est indisponible.');
  });
});
