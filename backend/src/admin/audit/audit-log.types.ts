/** Actions written to admin_audit_log in 1b (DEC-060, DEC-085). Other actions are added with their own step. */
export const AUDIT_ACTIONS = {
  /** A back-office sign-in, with the result 'ok' (second factor given) or 'failed' (wrong code). */
  adminLogin: 'auth.admin_login',
  /** A second factor set up and confirmed by an administrator. */
  mfaEnrol: 'auth.mfa_enrol',
  /** An account suspended by an administrator, with the reason (DEC-077, DEC-085). */
  userSuspend: 'user.suspend',
  /** A suspension lifted by an administrator, with the reason (DEC-077, DEC-085). */
  userReactivate: 'user.reactivate',
  /** A contact thread closed because the suspension was lifted (DEC-116, DEC-085). */
  contactClose: 'contact.close',
} as const;

/** The result column (DEC-085): 'ok', 'failed' or 'refused'. */
export type AuditResult = 'ok' | 'failed' | 'refused';

/** The table or object an action is about (DEC-085). */
export const AUDIT_TARGET_TYPES = {
  user: 'user',
  contact: 'contact',
} as const;

/** What the application gives the audit writer. The id and the time are set by the writer, before hashing. */
export interface NewAuditEntry {
  actorId: string | null;
  action: string;
  result: AuditResult;
  targetType: string;
  targetId: string;
  reason: string | null;
  details: Record<string, string | number | boolean | null> | null;
}

/** An entry as the back-office lists it. Times are ISO strings. */
export interface AuditEntryView {
  id: string;
  actorId: string | null;
  action: string;
  result: AuditResult;
  targetType: string;
  targetId: string;
  reason: string | null;
  details: Record<string, string | number | boolean | null> | null;
  createdAt: string;
}

/** One page of the listing, newest first. nextCursor is null on the last page. */
export interface AuditPage {
  items: AuditEntryView[];
  nextCursor: string | null;
}

/** The result of checking the whole chain (DEC-063). checked counts the entries read. */
export interface AuditVerification {
  valid: boolean;
  brokenAt: number | null;
  checked: number;
}

/** The object an entry is about: its target type and its id (DEC-085). */
export interface AuditTarget {
  targetType: string;
  targetId: string;
}

export interface AuditListOptions {
  /** The cursor of the previous page, as returned by the service. Absent on the first page. */
  cursor?: string;
  /** Between 1 and 50. */
  limit: number;
  /** Only the entries of this action. Absent: all actions. */
  action?: string;
}
