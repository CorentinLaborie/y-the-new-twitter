import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api-client';
import {
  accountListPath,
  adminLogin,
  auditListPath,
  getAccount,
  getAdminSession,
  listAccounts,
  reauthenticate,
  signOut,
  suspendAccount,
} from '@/lib/admin-api';

vi.mock('@/lib/api-client', () => ({ apiRequest: vi.fn() }));

const ANSWER = { ok: true, status: 200, body: {} } as never;

describe('accountListPath', () => {
  it('builds the first page without parameters', () => {
    expect(accountListPath()).toBe('/admin/users');
  });

  it('keeps only the parameters that are set', () => {
    expect(accountListPath({ q: 'alice', status: 'suspended', limit: 20 })).toBe(
      '/admin/users?q=alice&status=suspended&limit=20',
    );
  });

  it('passes the cursor of the next page as it was received', () => {
    expect(accountListPath({ cursor: 'abc_=-' })).toBe('/admin/users?cursor=abc_%3D-');
  });

  it('drops an empty query string', () => {
    expect(accountListPath({ q: '' })).toBe('/admin/users');
  });
});

describe('auditListPath', () => {
  it('builds the first page without parameters', () => {
    expect(auditListPath()).toBe('/admin/audit-log');
  });

  it('adds the action filter and the limit', () => {
    expect(auditListPath({ action: 'auth.admin_login', limit: 50 })).toBe(
      '/admin/audit-log?limit=50&action=auth.admin_login',
    );
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

  it('adminLogin sends the code with the password once the administrator has typed one', async () => {
    await adminLogin('admin@example.test', 'Abcdef1!', '123456');

    expect(apiRequest).toHaveBeenCalledWith('POST', '/admin/login', {
      body: { email: 'admin@example.test', password: 'Abcdef1!', code: '123456' },
    });
  });

  it('adminLogin treats an empty code as no code', async () => {
    await adminLogin('admin@example.test', 'Abcdef1!', '');

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

  it('reauthenticate sends the password and the code to the re-authentication route', async () => {
    await reauthenticate('Secret1234!', '123456');

    expect(apiRequest).toHaveBeenCalledWith('POST', '/admin/reauth', {
      body: { password: 'Secret1234!', code: '123456' },
    });
  });

  it('suspendAccount sends the status and the reason to the account status route', async () => {
    await suspendAccount('a/b c', 'Spam répété');

    expect(apiRequest).toHaveBeenCalledWith('PUT', '/admin/users/a%2Fb%20c/status', {
      body: { status: 'suspended', reason: 'Spam répété' },
    });
  });
});
