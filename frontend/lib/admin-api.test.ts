import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api-client';
import { adminLogin, closeSupportThread, decideReport, getAccount, getAdminSession, getDashboard, getReport, getSupportThread, listAccounts, listReports, listSupportThreads, reactivateAccount, reauthenticate, replySupportThread, signOut, deleteAccount, suspendAccount } from '@/lib/admin-api';

vi.mock('@/lib/api-client', () => ({ apiRequest: vi.fn() }));

const ANSWER = { ok: true, status: 200, body: {} } as never;





describe('report, contact and dashboard calls', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue(ANSWER);
  });

  it('listReports reads the report list', async () => {
    await listReports({ status: 'decided' });
    expect(apiRequest).toHaveBeenCalledWith('GET', '/admin/reports?status=decided');
  });

  it('getReport reads one report', async () => {
    await getReport('2c1d0e9f-8a7b-4c6d-9e5f-1a2b3c4d5e6f');
    expect(apiRequest).toHaveBeenCalledWith('GET', '/admin/reports/2c1d0e9f-8a7b-4c6d-9e5f-1a2b3c4d5e6f');
  });

  it('decideReport sends the decision, and the note only when it is given', async () => {
    await decideReport('r1', 'hide', 'Injure');
    expect(apiRequest).toHaveBeenLastCalledWith('PUT', '/admin/reports/r1/decision', {
      body: { decision: 'hide', note: 'Injure' },
    });

    await decideReport('r1', 'dismiss');
    expect(apiRequest).toHaveBeenLastCalledWith('PUT', '/admin/reports/r1/decision', {
      body: { decision: 'dismiss' },
    });
  });

  it('listSupportThreads, getSupportThread, replySupportThread and closeSupportThread call their routes', async () => {
    await listSupportThreads({ status: 'open' });
    expect(apiRequest).toHaveBeenLastCalledWith('GET', '/admin/support-threads?status=open');

    await getSupportThread('t1');
    expect(apiRequest).toHaveBeenLastCalledWith('GET', '/admin/support-threads/t1');

    await replySupportThread('t1', 'Bonjour');
    expect(apiRequest).toHaveBeenLastCalledWith('POST', '/admin/support-threads/t1/messages', {
      body: { text: 'Bonjour' },
    });

    await closeSupportThread('t1');
    expect(apiRequest).toHaveBeenLastCalledWith('PUT', '/admin/support-threads/t1/close');
  });

  it('getDashboard reads the indicators', async () => {
    await getDashboard();
    expect(apiRequest).toHaveBeenCalledWith('GET', '/admin/dashboard');
  });
});

describe('admin API calls', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue(ANSWER);
  });

  it('adminLogin sends the password alone while no code is typed', async () => {
    await adminLogin('admin@example.test', 'Abcdef1!');

    expect(apiRequest).toHaveBeenCalledWith('POST', '/admin/login', {
      body: { email: 'admin@example.test', password: 'Abcdef1!' },
    });
  });

  it('getAdminSession forwards the SESSION cookie when it is called on the server', async () => {
    await getAdminSession('SESSION=signed-id');

    expect(apiRequest).toHaveBeenCalledWith('GET', '/admin/session', { cookie: 'SESSION=signed-id' });
  });

  it('listAccounts calls the search with the parameters that are set', async () => {
    await listAccounts({ q: 'alice', limit: 20 });

    expect(apiRequest).toHaveBeenCalledWith('GET', '/admin/users?q=alice&limit=20');
  });

  it('getAccount encodes the account id in the path', async () => {
    await getAccount('a/b c');

    expect(apiRequest).toHaveBeenCalledWith('GET', '/admin/users/a%2Fb%20c');
  });

  it('signOut ends the session through the account sign-out route', async () => {
    await signOut();

    expect(apiRequest).toHaveBeenCalledWith('POST', '/auth/logout');
  });

  it('returns the answer of the shared client unchanged', async () => {
    const answer = { ok: false, problem: { status: 0, title: 'Réseau', detail: 'Injoignable.' } };
    vi.mocked(apiRequest).mockResolvedValue(answer as never);

    await expect(signOut()).resolves.toBe(answer);
  });

  it('reauthenticate sends the password to the re-authentication route', async () => {
    await reauthenticate('Secret1234!');

    expect(apiRequest).toHaveBeenCalledWith('POST', '/admin/reauth', {
      body: { password: 'Secret1234!' },
    });
  });

  it('suspendAccount sends the status and the reason to the account status route', async () => {
    await suspendAccount('a/b c', 'Spam répété');

    expect(apiRequest).toHaveBeenCalledWith('PUT', '/admin/users/a%2Fb%20c/status', {
      body: { status: 'suspended', reason: 'Spam répété' },
    });
  });

  it('reactivateAccount sends the active status and the reason to the account status route', async () => {
    await reactivateAccount('a/b c', 'Erreur de modération');

    expect(apiRequest).toHaveBeenCalledWith('PUT', '/admin/users/a%2Fb%20c/status', {
      body: { status: 'active', reason: 'Erreur de modération' },
    });
  });

  it('deleteAccount sends the reason code to the deletion route of the account', async () => {
    await deleteAccount('a/b c', 'spam');

    expect(apiRequest).toHaveBeenCalledWith('PUT', '/admin/users/a%2Fb%20c/deletion', {
      body: { reasonCode: 'spam' },
    });
  });

  it('deleteAccount sends the free text with the reason "Autre" only', async () => {
    await deleteAccount('account-1', 'other', 'Compte piraté');

    expect(apiRequest).toHaveBeenCalledWith('PUT', '/admin/users/account-1/deletion', {
      body: { reasonCode: 'other', otherReason: 'Compte piraté' },
    });
  });
});
