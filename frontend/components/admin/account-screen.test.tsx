import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccount, suspendAccount, type AccountView } from '@/lib/admin-api';
import { AccountScreen } from './account-screen';

vi.mock('@/lib/admin-api', () => ({ getAccount: vi.fn(), suspendAccount: vi.fn(), reauthenticate: vi.fn() }));

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
  });

  it('offers the suspension of an active account only', async () => {
    vi.mocked(getAccount).mockResolvedValue({
      ok: true,
      status: 200,
      body: { ...ACCOUNT, status: 'active' },
    });
    const { unmount } = render(<AccountScreen id={ACCOUNT.id} />);

    expect(await screen.findByRole('button', { name: 'Suspendre le compte' })).toBeInTheDocument();
    unmount();

    vi.mocked(getAccount).mockResolvedValue({ ok: true, status: 200, body: ACCOUNT });
    render(<AccountScreen id={ACCOUNT.id} />);

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspendre le compte' })).not.toBeInTheDocument();
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
