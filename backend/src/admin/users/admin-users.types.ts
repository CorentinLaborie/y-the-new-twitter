import type { AccountStatus, UserRole } from '../../database/generated/client/client';
import type { AuditEntryView } from '../audit/audit-log.types';

/** One account in the search results. Times are ISO strings. The e-mail address is masked (DEC-035). */
export interface AccountListItem {
  id: string;
  handle: string;
  displayName: string;
  status: AccountStatus;
  role: UserRole;
  maskedEmail: string;
  createdAt: string;
}

/** One page of the search, in the order of the sign-up date, newest first. nextCursor is null on the last page. */
export interface AccountPage {
  items: AccountListItem[];
  nextCursor: string | null;
}

export interface AccountListOptions {
  /** A handle, matched without regard to case, or a full e-mail address. Absent: every account. */
  q?: string;
  /** Only the accounts in this status. Absent: every status. */
  status?: AccountStatus;
  /** The cursor of the previous page, as the search returned it. Absent on the first page. */
  cursor?: string;
  /** Between 1 and 50. */
  limit: number;
}

/** The account page of the back-office (section 3.3): the search fields, and the details of the account. */
export interface AccountView extends AccountListItem {
  statusChangedAt: string | null;
  suspensionReason: string | null;
  lastLoginAt: string | null;
  activeSessionCount: number;
  /** The reports made about the account's questions and replies. */
  reports: { total: number; open: number };
  /** The account's questions and replies that are hidden or removed. */
  moderatedContentCount: number;
  /** The most recent audit entries about the account, newest first. */
  history: AuditEntryView[];
}
