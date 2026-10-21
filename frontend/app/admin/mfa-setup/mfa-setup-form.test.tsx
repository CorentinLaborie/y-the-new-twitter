import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmMfaSetup, startMfaSetup } from '@/lib/admin-api';
import { MfaSetupForm } from './mfa-setup-form';

let token: string | null = 'link-token';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(token === null ? '' : `token=${token}`),
}));
vi.mock('@/lib/admin-api', () => ({ startMfaSetup: vi.fn(), confirmMfaSetup: vi.fn() }));

const SETUP = { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/Y:admin?secret=JBSWY3DPEHPK3PXP' };

function problem(detail: string) {
  return { ok: false as const, problem: { status: 401, title: 'Unauthorized', detail } };
}

describe('MfaSetupForm', () => {
  beforeEach(() => {
    token = 'link-token';
    vi.mocked(startMfaSetup).mockReset();
    vi.mocked(confirmMfaSetup).mockReset();
  });

  it('asks for a link when the page has no token, and calls nothing', () => {
    token = null;

    render(<MfaSetupForm />);

    expect(screen.getByRole('alert')).toHaveTextContent('Ce lien est incomplet');
    expect(startMfaSetup).not.toHaveBeenCalled();
  });

  it('starts the set-up once with the token, and shows the secret', async () => {
    vi.mocked(startMfaSetup).mockResolvedValue({ ok: true, status: 200, body: SETUP });

    render(<MfaSetupForm />);

    expect(await screen.findByText(SETUP.secret)).toBeInTheDocument();
    expect(startMfaSetup).toHaveBeenCalledTimes(1);
    expect(startMfaSetup).toHaveBeenCalledWith('link-token');
  });

  it('shows the reason when the link is refused, and no code form', async () => {
    vi.mocked(startMfaSetup).mockResolvedValue(problem('Ce lien de configuration est invalide ou a expiré.'));

    render(<MfaSetupForm />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce lien de configuration est invalide ou a expiré.');
    expect(screen.queryByLabelText('Code de vérification à 6 chiffres')).not.toBeInTheDocument();
  });

  it('keeps the user on the form when the code is wrong, with the reason', async () => {
    vi.mocked(startMfaSetup).mockResolvedValue({ ok: true, status: 200, body: SETUP });
    vi.mocked(confirmMfaSetup).mockResolvedValue(problem('Code de vérification incorrect.'));
    render(<MfaSetupForm />);
    await screen.findByText(SETUP.secret);

    fireEvent.change(screen.getByLabelText('Code de vérification à 6 chiffres'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Code de vérification incorrect.');
    expect(confirmMfaSetup).toHaveBeenCalledWith('000000');
    expect(screen.queryByText('Notez ces codes de secours maintenant.', { exact: false })).not.toBeInTheDocument();
  });

  it('shows the backup codes once the first code is confirmed', async () => {
    vi.mocked(startMfaSetup).mockResolvedValue({ ok: true, status: 200, body: SETUP });
    vi.mocked(confirmMfaSetup).mockResolvedValue({ ok: true, status: 201, body: { backupCodes: ['ABCDE-FGHJK'] } });
    render(<MfaSetupForm />);
    await screen.findByText(SETUP.secret);

    fireEvent.change(screen.getByLabelText('Code de vérification à 6 chiffres'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByText('ABCDE-FGHJK')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Accéder au back-office' })).toHaveAttribute('href', '/admin'));
  });
});
