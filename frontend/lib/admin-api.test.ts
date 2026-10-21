import { describe, expect, it } from 'vitest';
import { accountListPath, auditListPath } from '@/lib/admin-api';

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
