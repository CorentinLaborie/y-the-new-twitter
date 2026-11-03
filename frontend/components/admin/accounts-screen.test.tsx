import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listAccounts, type AccountListItem } from '@/lib/admin-api';
import { AccountsScreen } from './accounts-screen';

vi.mock('@/lib/admin-api', () => ({ listAccounts: vi.fn() }));

const ALICE: AccountListItem = {
  id: '11111111-1111-4111-8111-111111111111',
  handle: 'AliceY',
  displayName: 'Alice',
  avatarUrl: null,
  status: 'active',
  role: 'user',
  maskedEmail: 'a***@d***.fr',
  createdAt: '2026-09-03T10:00:00.000Z',
};

const MARK: AccountListItem = {
  ...ALICE,
  id: '22222222-2222-4222-8222-222222222222',
  handle: 'MarkL',
  displayName: 'Mark',
  status: 'suspended',
  maskedEmail: 'm***@d***.fr',
};

describe('AccountsScreen', () => {
  beforeEach(() => {
    vi.mocked(listAccounts).mockReset();
  });

  it('shows the photo of an account in its row, or its initial without one (DEC-351)', async () => {
    vi.mocked(listAccounts).mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        items: [
          { ...ALICE, avatarUrl: '/avatars/alice.jpg' },
          { ...MARK, avatarUrl: null },
        ],
        nextCursor: null,
      },
    });
    render(<AccountsScreen />);

    await screen.findByRole('link', { name: '@AliceY' });
    expect(document.querySelector('img')?.getAttribute('src')).toContain('/avatars/alice.jpg');
  });

  it('lists the accounts, each linked to its view, with the masked address and the status', async () => {
    vi.mocked(listAccounts).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [ALICE], nextCursor: null },
    });
    render(<AccountsScreen />);

    const link = await screen.findByRole('link', { name: '@AliceY' });
    expect(link).toHaveAttribute('href', `/admin/users/${ALICE.id}`);
    expect(screen.getByText('a***@d***.fr')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Comptes' })).getByText('Actif')).toBeInTheDocument();
    expect(listAccounts).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });

  it('searches by the text typed and the status chosen', async () => {
    vi.mocked(listAccounts).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [ALICE], nextCursor: null },
    });
    render(<AccountsScreen />);
    await screen.findByRole('link', { name: '@AliceY' });

    fireEvent.change(screen.getByLabelText('Rechercher un compte'), { target: { value: '  marl ' } });
    fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'suspended' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));

    await waitFor(() =>
      expect(listAccounts).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'marl', status: 'suspended', cursor: undefined }),
      ),
    );
  });

  it('appends the next page, with the filter of the search', async () => {
    vi.mocked(listAccounts)
      .mockResolvedValueOnce({ ok: true, status: 200, body: { items: [ALICE], nextCursor: 'cursor-1' } })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { items: [MARK], nextCursor: null } });
    render(<AccountsScreen />);
    await screen.findByRole('link', { name: '@AliceY' });

    fireEvent.click(screen.getByRole('button', { name: 'Charger plus de comptes' }));

    expect(await screen.findByRole('link', { name: '@MarkL' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '@AliceY' })).toBeInTheDocument();
    expect(listAccounts).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-1' }));
    expect(screen.queryByRole('button', { name: 'Charger plus de comptes' })).not.toBeInTheDocument();
  });

  it('says when no account matches the search', async () => {
    vi.mocked(listAccounts).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [], nextCursor: null },
    });
    render(<AccountsScreen />);

    expect(await screen.findByText('Aucun compte ne correspond à cette recherche.')).toBeInTheDocument();
  });

  it('shows the API message when the search fails', async () => {
    vi.mocked(listAccounts).mockResolvedValue({
      ok: false,
      problem: { status: 500, title: 'Erreur', detail: 'Le service ne répond pas.' },
    });
    render(<AccountsScreen />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Le service ne répond pas.');
  });
});

describe('AccountsScreen goes back to a fresh list', () => {
  const FAILED = {
    ok: false,
    status: 500,
    problem: { status: 500, title: 'Erreur', detail: 'Erreur' },
  } as never;

  it('asks the list again when the viewer goes back', async () => {
    vi.mocked(listAccounts).mockResolvedValue(FAILED);
    render(<AccountsScreen />);
    await waitFor(() => expect(vi.mocked(listAccounts)).toHaveBeenCalled());
    const before = vi.mocked(listAccounts).mock.calls.length;

    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect(vi.mocked(listAccounts).mock.calls.length).toBeGreaterThan(before));
  });
});
