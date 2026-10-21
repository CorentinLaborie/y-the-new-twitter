import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAccount, getAccount, reactivateAccount, suspendAccount, type AccountView } from '@/lib/admin-api';
import { AccountScreen } from './account-screen';

vi.mock('@/lib/admin-api', () => ({
  getAccount: vi.fn(),
  suspendAccount: vi.fn(),
  reactivateAccount: vi.fn(),
  deleteAccount: vi.fn(),
  reauthenticate: vi.fn(),
}));

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

const ACCOUNT: AccountView = {
  id: ACCOUNT_ID,
  handle: 'AliceY',
  displayName: 'Alice',
  status: 'suspended',
  role: 'user',
  maskedEmail: 'a***@d***.fr',
  createdAt: '2026-09-03T10:00:00.000Z',
  statusChangedAt: '2026-10-13T09:40:00.000Z',
  suspensionReason: 'Suspension pour examen',
  lastLoginAt: '2026-10-16T08:12:00.000Z',
  activeSessionCount: 2,
  reports: { total: 3, open: 1 },
  moderatedContentCount: 2,
  history: [
    {
      id: 'e1',
      actorId: null,
      action: 'auth.admin_login',
      result: 'ok',
      targetType: 'user',
      targetId: ACCOUNT_ID,
      reason: null,
      details: null,
      createdAt: '2026-10-16T08:12:00.000Z',
    },
    {
      id: 'e2',
      actorId: null,
      action: 'auth.mfa_enrol',
      result: 'failed',
      targetType: 'user',
      targetId: ACCOUNT_ID,
      reason: 'Code incorrect',
      details: null,
      createdAt: '2026-10-10T14:22:00.000Z',
    },
  ],
};

describe('AccountScreen', () => {
  beforeEach(() => {
    vi.mocked(getAccount).mockReset();
    vi.mocked(suspendAccount).mockReset();
    vi.mocked(reactivateAccount).mockReset();
  });

  it('offers the suspension of an active account only', async () => {
    vi.mocked(getAccount).mockResolvedValue({
      ok: true,
      status: 200,
      body: { ...ACCOUNT, status: 'active' },
    });
    const { unmount } = render(<AccountScreen id={ACCOUNT.id} />);

    expect(await screen.findByRole('button', { name: 'Suspendre le compte' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lever la suspension' })).not.toBeInTheDocument();
    unmount();

    vi.mocked(getAccount).mockResolvedValue({ ok: true, status: 200, body: ACCOUNT });
    render(<AccountScreen id={ACCOUNT.id} />);

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspendre le compte' })).not.toBeInTheDocument();
  });

  it('offers the lifting of a suspension for a suspended account only', async () => {
    vi.mocked(getAccount).mockResolvedValue({ ok: true, status: 200, body: ACCOUNT });
    render(<AccountScreen id={ACCOUNT.id} />);

    expect(await screen.findByRole('button', { name: 'Lever la suspension' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspendre le compte' })).not.toBeInTheDocument();
  });

  it('lifts the suspension from its view, then shows the account as active', async () => {
    vi.mocked(getAccount)
      .mockResolvedValueOnce({ ok: true, status: 200, body: ACCOUNT })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { ...ACCOUNT, status: 'active', suspensionReason: null, statusChangedAt: '2026-10-21T12:00:00.000Z' },
      });
    vi.mocked(reactivateAccount).mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        id: ACCOUNT_ID,
        status: 'active',
        statusChangedAt: '2026-10-21T12:00:00.000Z',
        suspensionReason: null,
      },
    });
    render(<AccountScreen id={ACCOUNT.id} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Lever la suspension' }));
    expect(screen.getByRole('dialog', { name: 'Lever la suspension de @AliceY ?' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Motif (obligatoire)'), {
      target: { value: 'Erreur de modération' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Lever la suspension' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(reactivateAccount).toHaveBeenCalledWith(ACCOUNT_ID, 'Erreur de modération');
    expect(await screen.findByText('Actif')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lever la suspension' })).not.toBeInTheDocument();
    expect(getAccount).toHaveBeenCalledTimes(2);
  });

  it('suspends the account from its view, then shows the new status', async () => {
    const active = { ...ACCOUNT, status: 'active' as const, suspensionReason: null };
    vi.mocked(getAccount)
      .mockResolvedValueOnce({ ok: true, status: 200, body: active })
      .mockResolvedValueOnce({ ok: true, status: 200, body: ACCOUNT });
    vi.mocked(suspendAccount).mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        id: ACCOUNT_ID,
        status: 'suspended',
        statusChangedAt: '2026-10-13T09:40:00.000Z',
        suspensionReason: 'Suspension pour examen',
      },
    });
    render(<AccountScreen id={ACCOUNT.id} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Suspendre le compte' }));
    fireEvent.change(screen.getByLabelText('Motif (obligatoire)'), {
      target: { value: 'Suspension pour examen' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspendre le compte' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(suspendAccount).toHaveBeenCalledWith(ACCOUNT_ID, 'Suspension pour examen');
    expect(await screen.findByText('Suspendu')).toBeInTheDocument();
    expect(getAccount).toHaveBeenCalledTimes(2);
  });

  it('shows the details, the reports, the moderated content and the history of the account', async () => {
    vi.mocked(getAccount).mockResolvedValue({ ok: true, status: 200, body: ACCOUNT });
    render(<AccountScreen id={ACCOUNT.id} />);

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(getAccount).toHaveBeenCalledWith(ACCOUNT.id);
    expect(screen.getByText('@AliceY')).toBeInTheDocument();
    expect(screen.getByText('Suspendu')).toBeInTheDocument();
    expect(screen.getByText('Suspension pour examen')).toBeInTheDocument();
    expect(screen.getByText('a***@d***.fr')).toBeInTheDocument();
    // The last login, and the history entry of the same moment.
    expect(screen.getAllByText('16/10/2026 08h12')).toHaveLength(2);
    expect(screen.getByText('Signalements reçus').nextSibling).toHaveTextContent('3');
    expect(screen.getByText('Contenus masqués ou retirés').nextSibling).toHaveTextContent('2');
    expect(screen.getByText('Connexion administrateur')).toBeInTheDocument();
    expect(screen.getByText('Double authentification configurée')).toBeInTheDocument();
    expect(screen.getByText('Échec · Code incorrect')).toBeInTheDocument();
  });

  it('offers the deletion of an active or a suspended account, and not of a pending one', async () => {
    vi.mocked(getAccount).mockResolvedValueOnce({ ok: true, status: 200, body: { ...ACCOUNT, status: 'active' } });
    const active = render(<AccountScreen id={ACCOUNT.id} />);

    expect(await screen.findByRole('button', { name: 'Supprimer le compte' })).toBeInTheDocument();
    active.unmount();

    vi.mocked(getAccount).mockResolvedValueOnce({ ok: true, status: 200, body: ACCOUNT });
    const suspended = render(<AccountScreen id={ACCOUNT.id} />);

    expect(await screen.findByRole('button', { name: 'Supprimer le compte' })).toBeInTheDocument();
    suspended.unmount();

    vi.mocked(getAccount).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { ...ACCOUNT, status: 'pending_deletion' },
    });
    render(<AccountScreen id={ACCOUNT.id} />);

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer le compte' })).not.toBeInTheDocument();
  });

  it('deletes the account from its view with a reason, then shows the pending deletion', async () => {
    const active = { ...ACCOUNT, status: 'active' as const, suspensionReason: null };
    vi.mocked(getAccount)
      .mockResolvedValueOnce({ ok: true, status: 200, body: active })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { ...ACCOUNT, status: 'pending_deletion' } });
    vi.mocked(deleteAccount).mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        id: ACCOUNT_ID,
        status: 'pending_deletion',
        statusChangedAt: '2026-10-21T12:00:00.000Z',
        suspensionReason: null,
      },
    });
    render(<AccountScreen id={ACCOUNT.id} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer le compte' }));
    fireEvent.change(screen.getByLabelText('Motif (obligatoire)'), { target: { value: 'spam' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer le compte' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteAccount).toHaveBeenCalledWith(ACCOUNT_ID, 'spam', undefined);
    expect(await screen.findByText('En attente de suppression')).toBeInTheDocument();
    expect(getAccount).toHaveBeenCalledTimes(2);
  });

  it('links back to the account search', async () => {
    vi.mocked(getAccount).mockResolvedValue({ ok: true, status: 200, body: ACCOUNT });
    render(<AccountScreen id={ACCOUNT.id} />);

    expect(await screen.findByRole('link', { name: '← Retour aux comptes' })).toHaveAttribute(
      'href',
      '/admin/users',
    );
  });

  it('shows the API message for an unknown account', async () => {
    vi.mocked(getAccount).mockResolvedValue({
      ok: false,
      problem: { status: 404, title: 'Introuvable', detail: 'Compte introuvable.' },
    });
    render(<AccountScreen id={ACCOUNT.id} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Compte introuvable.');
  });

  it('tells the administrator that the session ended, with a link to sign in again', async () => {
    vi.mocked(getAccount).mockResolvedValue({
      ok: false,
      problem: { status: 401, title: 'Session', detail: 'Connexion administrateur requise.' },
    });
    render(<AccountScreen id={ACCOUNT.id} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Votre session d’administration a pris fin.');
    expect(screen.getByRole('link', { name: 'Se reconnecter' })).toHaveAttribute('href', '/admin/login');
  });
});
