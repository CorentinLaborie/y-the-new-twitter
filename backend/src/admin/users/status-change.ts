import type { AccountStatus } from '../../database/generated/client/client';

/** The statuses an administrator can set by this route (DEC-077). Other statuses are set by the user's own flows. */
export const REQUESTED_ACCOUNT_STATUSES = ['active', 'suspended'] as const;
export type RequestedAccountStatus = (typeof REQUESTED_ACCOUNT_STATUSES)[number];

/** The change an administrator makes: a suspension, or a lifting of a suspension (reactivation). */
type StatusChangeKind = 'suspend' | 'reactivate';

/**
 * The change a request asks for, or null when the account cannot go there. Only an active account can be suspended,
 * and only a suspended account can be reactivated. Any other request is refused, and so is a request that changes
 * nothing.
 */
export function statusChangeKind(
  current: AccountStatus,
  requested: RequestedAccountStatus,
): StatusChangeKind | null {
  if (current === 'active' && requested === 'suspended') {
    return 'suspend';
  }

  if (current === 'suspended' && requested === 'active') {
    return 'reactivate';
  }

  return null;
}

/**
 * True when an administrator can start the deletion window of an account in this status: an active or a suspended
 * account. A pending or erased account is already on its way, and an unverified one has no window to join.
 */
export function canStartAdminDeletion(current: AccountStatus): boolean {
  return current === 'active' || current === 'suspended';
}

/** The state of the contact thread of an account, as the change needs it (DEC-116). */
export interface ContactThreadState {
  id: string;
  status: 'new' | 'replied' | 'closed';
  closedByLift: boolean;
}

/**
 * What happens to the contact thread (DEC-116, DEC-117). A lifting closes the open thread (new or replied) and marks it
 * closed by the lifting. A new suspension reopens the thread that the lifting closed. A thread closed with "Marquer
 * comme traité" stays closed. Null when the thread does not change.
 */
export type ContactThreadPlan = { kind: 'close'; threadId: string } | { kind: 'reopen'; threadId: string };

export function contactThreadPlan(
  kind: StatusChangeKind,
  thread: ContactThreadState | null,
): ContactThreadPlan | null {
  if (thread === null) {
    return null;
  }

  if (kind === 'reactivate' && (thread.status === 'new' || thread.status === 'replied')) {
    return { kind: 'close', threadId: thread.id };
  }

  if (kind === 'suspend' && thread.status === 'closed' && thread.closedByLift) {
    return { kind: 'reopen', threadId: thread.id };
  }

  return null;
}
