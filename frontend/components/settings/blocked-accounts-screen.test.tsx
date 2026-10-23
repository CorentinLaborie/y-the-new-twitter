import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listBlockedAccounts, unblockAccount } from '@/lib/blocks-api';
import { BlockedAccountsScreen } from './blocked-accounts-screen';

vi.mock('@/lib/blocks-api', () => ({ listBlockedAccounts: vi.fn(), unblockAccount: vi.fn() }));

const ALICE_BLOCK = { handle: 'bob', displayName: 'Bob', blockedAt: '2026-10-23T09:00:00.000Z' };
const CAROL_BLOCK = { handle: 'carol', displayName: 'Carol', blockedAt: '2026-10-22T09:00:00.000Z' };

beforeEach(() => {
  vi.mocked(listBlockedAccounts).mockReset();
  vi.mocked(unblockAccount).mockReset();
});

describe('BlockedAccountsScreen', () => {
  it('shows the blocked accounts with a Débloquer button each', async () => {
    vi.mocked(listBlockedAccounts).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [ALICE_BLOCK, CAROL_BLOCK], nextCursor: null },
    });

    render(<BlockedAccountsScreen />);

    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('@carol')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Débloquer' })).toHaveLength(2);
  });

  it('says so when no account is blocked', async () => {
    vi.mocked(listBlockedAccounts).mockResolvedValue({ ok: true, status: 200, body: { items: [], nextCursor: null } });

    render(<BlockedAccountsScreen />);

    expect(await screen.findByText('Vous n’avez bloqué aucun compte.')).toBeInTheDocument();
  });

  it('lifts a block at once, with no confirmation, and says so', async () => {
    vi.mocked(listBlockedAccounts).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [ALICE_BLOCK], nextCursor: null },
    });
    vi.mocked(unblockAccount).mockResolvedValue({ ok: true, status: 204, body: undefined });

    render(<BlockedAccountsScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Débloquer' }));

    await waitFor(() => expect(screen.queryByText('Bob')).toBeNull());
    expect(unblockAccount).toHaveBeenCalledWith('bob');
    expect(screen.getByRole('status')).toHaveTextContent('@bob est débloqué.');
  });

  it('keeps the row and says so when the unblock fails', async () => {
    vi.mocked(listBlockedAccounts).mockResolvedValue({
      ok: true,
      status: 200,
      body: { items: [ALICE_BLOCK], nextCursor: null },
    });
    vi.mocked(unblockAccount).mockResolvedValue({ ok: false, problem: { status: 500, title: 'Erreur', detail: 'Erreur.' } });

    render(<BlockedAccountsScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Débloquer' }));

    expect(await screen.findByText('Le compte n’a pas pu être débloqué. Réessayez.')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows an alert with Réessayer when the list cannot be loaded, and loads it again', async () => {
    vi.mocked(listBlockedAccounts)
      .mockResolvedValueOnce({ ok: false, problem: { status: 500, title: 'Erreur', detail: 'Erreur.' } })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { items: [ALICE_BLOCK], nextCursor: null } });

    render(<BlockedAccountsScreen />);

    expect(await screen.findByRole('alert')).toHaveTextContent('La liste des comptes bloqués n’a pas pu être chargée.');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Bob')).toBeInTheDocument();
  });

  it('adds the next page on Voir plus, and hides the button on the last page', async () => {
    vi.mocked(listBlockedAccounts)
      .mockResolvedValueOnce({ ok: true, status: 200, body: { items: [ALICE_BLOCK], nextCursor: 'next' } })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { items: [CAROL_BLOCK], nextCursor: null } });

    render(<BlockedAccountsScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Voir plus' }));

    expect(await screen.findByText('Carol')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voir plus' })).toBeNull();
    expect(listBlockedAccounts).toHaveBeenLastCalledWith({ cursor: 'next' });
  });
});
