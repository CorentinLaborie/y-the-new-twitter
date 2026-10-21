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

/** The answer of PUT /admin/users/{id}/status (StatusChangeResult). */
export type StatusChangeResult = {
  id: string;
  status: AccountStatus;
  statusChangedAt: string;
  suspensionReason: string | null;
};

/**
 * Re-authentication of the administrator (DEC-088): the password again, and a second-factor code. Valid for 10 minutes,
 * and the sensitive actions (such as a suspension) need it.
 */
export function reauthenticate(
  password: string,
  code: string,
): Promise<ApiResult<{ reauthExpiresAt: string }>> {
  return apiRequest<{ reauthExpiresAt: string }>('POST', '/admin/reauth', { body: { password, code } });
}

/** Suspends an account with its reason. Needs a current re-authentication: otherwise the answer carries reauth_required. */
export function suspendAccount(id: string, reason: string): Promise<ApiResult<StatusChangeResult>> {
  return changeAccountStatus(id, 'suspended', reason);
}

/** Lifts the suspension of an account, with its reason. Needs a current re-authentication, as the suspension does. */
export function reactivateAccount(id: string, reason: string): Promise<ApiResult<StatusChangeResult>> {
  return changeAccountStatus(id, 'active', reason);
}

function changeAccountStatus(
  id: string,
  status: 'active' | 'suspended',
  reason: string,
): Promise<ApiResult<StatusChangeResult>> {
  return apiRequest<StatusChangeResult>('PUT', `/admin/users/${encodeURIComponent(id)}/status`, {
    body: { status, reason },
  });
}

/** The reasons an administrator can pick to delete an account (the API names them, see account-deletion-reasons.ts). */
export type DeletionReasonCode = 'abuse' | 'spam' | 'harassment' | 'identity_theft' | 'other';

/**
 * Starts the 90-day deletion window of an account, with its reason. `otherReason` is the free text, sent only with
 * the reason "Autre". Needs a current re-authentication, as for suspendAccount.
 */
export function deleteAccount(
  id: string,
  reasonCode: DeletionReasonCode,
  otherReason?: string,
): Promise<ApiResult<StatusChangeResult>> {
  return apiRequest<StatusChangeResult>('PUT', `/admin/users/${encodeURIComponent(id)}/deletion`, {
    body: otherReason === undefined ? { reasonCode } : { reasonCode, otherReason },
  });
}

/** The reasons of a report (ReportReason). */
export type ReportReason = 'spam' | 'harassment' | 'hate' | 'illegal_content' | 'misinformation' | 'other';

/** The status of a report: open, or decided (resolved when the content is hidden, dismissed otherwise). */
export type ReportStatus = 'open' | 'resolved' | 'dismissed';

/** The decision recorded on a report: the content is hidden, or nothing is done to it. */
export type ReportDecision = 'content_hidden' | 'no_action';

/** The moderation status of a question or a reply (ModerationStatus). */
export type ModerationStatus = 'visible' | 'hidden' | 'removed';

/** The kind of content a report is about. */
export type ReportTargetType = 'question' | 'reply';

/** The content a report is about, with its author's handle (never the e-mail address). Times are ISO strings. */
export type ReportTarget = {
  type: ReportTargetType;
  id: string;
  body: string;
  authorHandle: string;
  authorDisplayName: string;
  moderationStatus: ModerationStatus;
  createdAt: string;
};

/** One report of the list. reportCount counts the reports made on the same content. */
export type ReportListItem = {
  id: string;
  createdAt: string;
  reason: ReportReason;
  status: ReportStatus;
  target: ReportTarget;
  reportCount: number;
};

export type ReportPage = { items: ReportListItem[]; nextCursor: string | null };

/** A report made on the content of a report (the reporter is not shown). */
export type ContentReport = {
  id: string;
  createdAt: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
};

/** One report with its content and the reports made on that content (ReportDetailView). */
export type ReportDetail = {
  id: string;
  createdAt: string;
  reason: ReportReason;
  status: ReportStatus;
  decision: ReportDecision | null;
  decisionNote: string | null;
  decidedAt: string | null;
  target: ReportTarget;
  reports: ContentReport[];
};

/** The answer of PUT /admin/reports/{id}/decision. */
export type ReportDecisionResult = {
  id: string;
  status: ReportStatus;
  decision: ReportDecision;
  decidedAt: string;
};

/** 'hide' hides the content and closes the open reports on it; 'dismiss' closes the report only. */
export type ReportDecisionName = 'hide' | 'dismiss';

export type ReportListOptions = {
  status?: 'open' | 'decided';
  reason?: ReportReason;
  cursor?: string;
  limit?: number;
};

/** The status of a contact thread: new, replied by an administrator, or closed (SupportStatus). */
export type SupportStatus = 'new' | 'replied' | 'closed';

/** The account that wrote a contact thread, with its masked e-mail address. */
export type SupportAccount = {
  id: string;
  handle: string;
  displayName: string;
  status: AccountStatus;
  maskedEmail: string;
  createdAt: string;
};

/** One thread of the list. receivedAt and latestMessage are those of the latest message the account wrote. */
export type SupportThreadListItem = {
  id: string;
  reference: string;
  status: SupportStatus;
  receivedAt: string | null;
  latestMessage: string | null;
  account: SupportAccount;
};

export type SupportThreadPage = { items: SupportThreadListItem[]; nextCursor: string | null };

/** One message of a thread: written by the account (user) or by an administrator (admin). */
export type SupportMessage = {
  id: string;
  authorType: 'user' | 'admin';
  body: string;
  sentAt: string;
};

/** One thread with its account and all its messages, oldest first (SupportThreadDetailView). */
export type SupportThreadDetail = {
  id: string;
  reference: string;
  status: SupportStatus;
  createdAt: string;
  closedAt: string | null;
  closedByLift: boolean;
  account: SupportAccount & { statusChangedAt: string | null; suspensionReason: string | null };
  messages: SupportMessage[];
};

export type SupportListOptions = {
  status?: 'open' | 'closed';
  cursor?: string;
  limit?: number;
};

/** The indicators of the dashboard (DashboardView). Times are ISO strings. */
export type DashboardView = {
  openReportCount: number;
  oldestOpenReportAt: string | null;
  averageHandlingSeconds: number | null;
  pendingDeletionCount: number;
  nextPurgeAt: string | null;
};

/** Path of the report list, with only the parameters that are set. */
export function reportListPath(options: ReportListOptions = {}): string {
  return `/admin/reports${withQuery({
    status: options.status,
    reason: options.reason,
    cursor: options.cursor,
    limit: options.limit,
  })}`;
}

/** Path of the thread list, with only the parameters that are set. */
export function supportListPath(options: SupportListOptions = {}): string {
  return `/admin/support-threads${withQuery({
    status: options.status,
    cursor: options.cursor,
    limit: options.limit,
  })}`;
}

export function listReports(options: ReportListOptions = {}): Promise<ApiResult<ReportPage>> {
  return apiRequest<ReportPage>('GET', reportListPath(options));
}

export function getReport(id: string): Promise<ApiResult<ReportDetail>> {
  return apiRequest<ReportDetail>('GET', `/admin/reports/${encodeURIComponent(id)}`);
}

/**
 * Hides the reported content, or dismisses the report, with an optional note. Needs a current re-authentication:
 * otherwise the answer carries reauth_required.
 */
export function decideReport(
  id: string,
  decision: ReportDecisionName,
  note?: string,
): Promise<ApiResult<ReportDecisionResult>> {
  return apiRequest<ReportDecisionResult>('PUT', `/admin/reports/${encodeURIComponent(id)}/decision`, {
    body: note === undefined ? { decision } : { decision, note },
  });
}

export function listSupportThreads(options: SupportListOptions = {}): Promise<ApiResult<SupportThreadPage>> {
  return apiRequest<SupportThreadPage>('GET', supportListPath(options));
}

export function getSupportThread(id: string): Promise<ApiResult<SupportThreadDetail>> {
  return apiRequest<SupportThreadDetail>('GET', `/admin/support-threads/${encodeURIComponent(id)}`);
}

/** Sends an answer to the account, by e-mail. */
export function replySupportThread(id: string, text: string): Promise<ApiResult<SupportThreadDetail>> {
  return apiRequest<SupportThreadDetail>(
    'POST',
    `/admin/support-threads/${encodeURIComponent(id)}/messages`,
    {
      body: { text },
    },
  );
}

/** Closes an open thread without sending anything. Needs a current re-authentication. */
export function closeSupportThread(id: string): Promise<ApiResult<SupportThreadDetail>> {
  return apiRequest<SupportThreadDetail>('PUT', `/admin/support-threads/${encodeURIComponent(id)}/close`);
}

export function getDashboard(): Promise<ApiResult<DashboardView>> {
  return apiRequest<DashboardView>('GET', '/admin/dashboard');
}

/** Ends the session of the visitor on the server (the same route as the account sign-out). */
export function signOut(): Promise<ApiResult<Record<string, never>>> {
  return apiRequest<Record<string, never>>('POST', '/auth/logout');
}
