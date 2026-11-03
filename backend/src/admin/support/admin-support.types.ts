import type { AccountStatus, SupportAuthorType, SupportStatus } from '../../database/generated/client/client';

/** The filter of the thread list: the open threads (new or replied), or the closed ones. Absent: all. */
export type SupportListStatus = 'open' | 'closed';

export interface SupportListOptions {
  status?: SupportListStatus;
  cursor?: string;
  /** Between 1 and 50. */
  limit: number;
}

/** The account that wrote a thread. The e-mail address is masked (DEC-035). Times are ISO strings. */
export interface SupportAccountView {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  status: AccountStatus;
  maskedEmail: string;
  createdAt: string;
}

/** One thread of the list. latestMessage and receivedAt are those of the latest message the account wrote. */
export interface SupportThreadListItem {
  id: string;
  reference: string;
  status: SupportStatus;
  receivedAt: string | null;
  latestMessage: string | null;
  account: SupportAccountView;
}

/** One page of the thread list, newest thread first. nextCursor is null on the last page. */
export interface SupportThreadPage {
  items: SupportThreadListItem[];
  nextCursor: string | null;
}

/** One message of a thread: written by the account (user) or by an administrator (admin). */
interface SupportMessageView {
  id: string;
  authorType: SupportAuthorType;
  body: string;
  sentAt: string;
}

/** The account of a thread, with what the thread needs of its suspension. */
interface SupportThreadAccountView extends SupportAccountView {
  /** The time of the last status change of the account: the suspension, when the account is suspended. */
  statusChangedAt: string | null;
  suspensionReason: string | null;
}

/** One thread with all its messages, oldest first. */
export interface SupportThreadDetailView {
  id: string;
  reference: string;
  status: SupportStatus;
  createdAt: string;
  closedAt: string | null;
  closedByLift: boolean;
  account: SupportThreadAccountView;
  messages: SupportMessageView[];
}
