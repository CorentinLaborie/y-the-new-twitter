import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logout } from '@/lib/auth-api';
import { getAccount } from '@/lib/settings-api';
import { SettingsHub } from './settings-hub';

const replace = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}));

vi.mock('@/lib/auth-api', () => ({ logout: vi.fn() }));
vi.mock('@/lib/settings-api', () => ({ getAccount: vi.fn() }));

const ACCOUNT = {
  handle: 'alice',
  displayName: 'Alice Martin',
  email: 'alice@example.test',
  status: 'active',
  deletionPurgeAt: null,
};

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  vi.mocked(logout).mockReset();
  vi.mocked(getAccount).mockReset();
});

describe('SettingsHub', () => {
  it('says the settings are loading, then shows the e-mail and the sections', async () => {
    vi.mocked(getAccount).mockResolvedValue({ ok: true, status: 200, body: ACCOUNT });

    render(<SettingsHub />);

    expect(screen.getByRole('status')).toHaveTextContent('Chargement des paramètres');
    expect(await screen.findByText('alice@example.test')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Changer de mot de passe' })).toHaveAttribute('href', '/settings/password');
    expect(screen.getByRole('link', { name: 'Changer d’adresse e-mail' })).toHaveAttribute('href', '/settings/email');
    expect(screen.getByRole('link', { name: 'Gérer mes notifications' })).toHaveAttribute('href', '/settings/notifications');
  });

  it('links the blocked accounts under Confidentialité', async () => {
    vi.mocked(getAccount).mockResolvedValue({ ok: true, status: 200, body: ACCOUNT });

    render(<SettingsHub />);
    await screen.findByText('alice@example.test');

    expect(screen.getByRole('link', { name: 'Comptes bloqués' })).toHaveAttribute('href', '/settings/blocked');
  });

  it('links the legal pages under Aide et à propos, and the deletion', async () => {
    vi.mocked(getAccount).mockResolvedValue({ ok: true, status: 200, body: ACCOUNT });

    render(<SettingsHub />);
    await screen.findByText('alice@example.test');

    expect(screen.getByRole('link', { name: 'Conditions d’utilisation' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Politique de confidentialité' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Utilisation des cookies' })).toHaveAttribute('href', '/cookies');
    expect(screen.getByRole('link', { name: 'Supprimer mon compte' })).toHaveAttribute('href', '/settings/delete-account');
  });

  it('shows the read error with Réessayer, and loads the account again on it', async () => {
    vi.mocked(getAccount)
      .mockResolvedValueOnce({ ok: false, problem: { status: 500, title: 'Erreur', detail: 'Erreur.' } })
      .mockResolvedValueOnce({ ok: true, status: 200, body: ACCOUNT });

    render(<SettingsHub />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Vos paramètres n’ont pas pu être chargés.');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('alice@example.test')).toBeInTheDocument();
  });

  it('still offers the sign-out when the account cannot be read', async () => {
    vi.mocked(getAccount).mockResolvedValue({ ok: false, problem: { status: 500, title: 'Erreur', detail: 'Erreur.' } });

    render(<SettingsHub />);
    await screen.findByRole('alert');

    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeEnabled();
  });

  it('signs out through the server, then goes to the login page', async () => {
    vi.mocked(getAccount).mockResolvedValue({ ok: true, status: 200, body: ACCOUNT });
    vi.mocked(logout).mockResolvedValue({ ok: true, status: 204, body: {} });

    render(<SettingsHub />);
    await screen.findByText('alice@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(refresh).toHaveBeenCalled();
  });

  it('keeps the page and shows the message when the sign-out is not confirmed', async () => {
    vi.mocked(getAccount).mockResolvedValue({ ok: true, status: 200, body: ACCOUNT });
    vi.mocked(logout).mockResolvedValue({
      ok: false,
      problem: { status: 0, title: 'Réseau', detail: 'Le serveur est injoignable.' },
    });

    render(<SettingsHub />);
    await screen.findByText('alice@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));

    expect(await screen.findByText('Le serveur est injoignable.')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
