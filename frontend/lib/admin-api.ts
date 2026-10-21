/*
 * Client of the back-office API (admin 1a to 1c). The routes live under /api/v1/admin and are not in the public
 * contract (DEC-037): an account that is not an administrator gets 404, and an administrator without a current
 * elevation gets 401. Every call goes through the shared client in lib/api-client.ts, so it never throws.
 */

import { apiRequest, type ApiResult } from '@/lib/api-client';
import type { AccountStatus } from '@/lib/auth-api';

export type AdminRole = 'user' | 'moderator' | 'admin';

/** The administrator as the back-office API names them (AdminUserView). */
export type AdminUser = { handle: string; displayName: string };

/** The answer of POST /admin/login. `setup_required` carries no user: the second factor is not configured yet. */
export type AdminLoginResult =
  { status: 'ok'; user: AdminUser } | { status: 'code_required' } | { status: 'setup_required' };

/** GET /admin/session: the administrator and when the back-office session ends. Times are ISO strings. */
export type AdminSession = { user: AdminUser; idleExpiresAt: string; expiresAt: string };

/** One account of the search (AccountListItem). The e-mail address is masked (DEC-035). */
export type AccountListItem = {
  id: string;
  handle: string;
  displayName: string;
  status: AccountStatus;
  role: AdminRole;
  maskedEmail: string;
  createdAt: string;
};

export type AccountPage = { items: AccountListItem[]; nextCursor: string | null };

/** The account view (AccountView): the search fields, plus the activity and the recent audit entries. */
export type AccountView = AccountListItem & {
  statusChangedAt: string | null;
  suspensionReason: string | null;
  lastLoginAt: string | null;
  activeSessionCount: number;
  reports: { total: number; open: number };
  moderatedContentCount: number;
  history: AuditEntry[];
};

/** Result of an audit entry: 'ok', 'failed' or 'refused' (DEC-085). */
export type AuditResult = 'ok' | 'failed' | 'refused';

export type AuditEntry = {
  id: string;
  actorId: string | null;
  action: string;
  result: AuditResult;
  targetType: string;
  targetId: string;
  reason: string | null;
  details: Record<string, string | number | boolean | null> | null;
  createdAt: string;
};

export type AuditPage = { items: AuditEntry[]; nextCursor: string | null };

export type AccountListOptions = {
  q?: string;
  status?: AccountStatus;
  cursor?: string;
  limit?: number;
};

export type AuditListOptions = {
  cursor?: string;
  limit?: number;
  action?: string;
};

/** Path of the account search, with only the parameters that are set. */
export function accountListPath(options: AccountListOptions = {}): string {
  return `/admin/users${withQuery({
    q: options.q,
    status: options.status,
    cursor: options.cursor,
    limit: options.limit,
  })}`;
}

/** Path of the audit log listing, with only the parameters that are set. */
export function auditListPath(options: AuditListOptions = {}): string {
  return `/admin/audit-log${withQuery({
    cursor: options.cursor,
    limit: options.limit,
    action: options.action,
  })}`;
}

function withQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(name, String(value));
    }
  }
  const query = search.toString();
  return query === '' ? '' : `?${query}`;
}

/**
 * The first step of the back-office sign-in is the password alone, then the second factor. `code` is sent only when
 * the administrator has typed one.
 */
export function adminLogin(
  email: string,
  password: string,
  code?: string,
): Promise<ApiResult<AdminLoginResult>> {
  return apiRequest<AdminLoginResult>('POST', '/admin/login', {
    body: code === undefined || code === '' ? { email, password } : { email, password, code },
  });
}

/** `cookie` is the SESSION cookie of the visitor when the call is made on the server (see requireAdminSession). */
export function getAdminSession(cookie?: string): Promise<ApiResult<AdminSession>> {
  return apiRequest<AdminSession>('GET', '/admin/session', { cookie });
}

export function listAccounts(options: AccountListOptions = {}): Promise<ApiResult<AccountPage>> {
  return apiRequest<AccountPage>('GET', accountListPath(options));
}

export function getAccount(id: string): Promise<ApiResult<AccountView>> {
  return apiRequest<AccountView>('GET', `/admin/users/${encodeURIComponent(id)}`);
}

export function listAuditLog(options: AuditListOptions = {}): Promise<ApiResult<AuditPage>> {
  return apiRequest<AuditPage>('GET', auditListPath(options));
}

/** Ends the session of the visitor on the server (the same route as the account sign-out). */
export function signOut(): Promise<ApiResult<Record<string, never>>> {
  return apiRequest<Record<string, never>>('POST', '/auth/logout');
}
