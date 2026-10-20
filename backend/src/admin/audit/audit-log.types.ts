/** Actions written to admin_audit_log in 1b (DEC-060, DEC-085). Other actions are added with their own step. */
export const AUDIT_ACTIONS = {
  /** A back-office sign-in, with the result 'ok' (second factor given) or 'failed' (wrong code). */
  adminLogin: 'auth.admin_login',
  /** A second factor set up and confirmed by an administrator. */
  mfaEnrol: 'auth.mfa_enrol',
} as const;

/** The result column (DEC-085): 'ok', 'failed' or 'refused'. */
export type AuditResult = 'ok' | 'failed' | 'refused';

/** Targets written in 1b. The target type is the table or object the action is about (DEC-085). */
export const AUDIT_TARGET_TYPES = {
  user: 'user',
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

export interface AuditListOptions {
  /** The cursor of the previous page, as returned by the service. Absent on the first page. */
  cursor?: string;
  /** Between 1 and 100. */
  limit: number;
  /** Only the entries of this action. Absent: all actions. */
  action?: string;
}
