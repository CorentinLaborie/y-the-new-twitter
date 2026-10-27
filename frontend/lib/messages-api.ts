/*
 * Client of the private messages (section 9 of the conditions). Contract: backend/openapi.yaml, served under /api/v1.
 *
 * POST /messages/conversations                       201 { conversationId }. Opens or writes to the conversation.
 * GET  /messages/conversations?requests&archived&cursor&limit   200 { conversations, nextCursor }, newest first.
 * POST /messages/conversations/{id}/messages         201 MessageView.
 * GET  /messages/conversations/{id}/messages?cursor&limit       200 { messages, nextCursor }, newest first.
 * PUT  /messages/conversations/{id}/accept | decline | read | mute | archive   204.
 * DELETE /messages/conversations/{id}/mute | archive   204.
 *
 * Each function returns an ApiResult (lib/api-client.ts): the body on success, the ApiProblem otherwise. Nothing is thrown.
 */

import type { ApiResult } from '@/lib/api-client';
import { protectedApiRequest } from '@/lib/session-expired';

/** The request state of a conversation as the viewer sees it. */
export type ConversationStatus = 'pending' | 'accepted' | 'declined';

/** One conversation of the viewer's lists, with the other account and the viewer's own state. */
export type ConversationView = {
  id: string;
  status: ConversationStatus;
  initiatedByViewer: boolean;
  other: { handle: string; displayName: string };
  lastMessageAt: string;
  /** The newest message: its text, and whether the viewer wrote it. Null when there is no message yet. */
  lastMessage: { text: string; mine: boolean } | null;
  unread: boolean;
  muted: boolean;
  archived: boolean;
};

/** One message of a conversation. `mine` is true when the viewer wrote it. */
export type MessageView = { id: string; text: string; createdAt: string; mine: boolean };

export type ConversationPage = { conversations: ConversationView[]; nextCursor: string | null };
export type MessagePage = { messages: MessageView[]; nextCursor: string | null };

/** Which list the viewer reads: the accepted conversations, the requests waiting for them, or the archived ones. */
export type ConversationListOptions = { requests?: boolean; archived?: boolean; cursor?: string; limit?: number };

function conversationPath(conversationId: string): string {
  return `/messages/conversations/${encodeURIComponent(conversationId)}`;
}

/** The query of a list: only the parameters that are set are sent. */
function withQuery(path: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, value);
    }
  }
  const search = query.toString();
  return search === '' ? path : `${path}?${search}`;
}

/** Opens the conversation with a handle, or writes to the one already open. */
export function startConversation(handle: string, text: string): Promise<ApiResult<{ conversationId: string }>> {
  return protectedApiRequest<{ conversationId: string }>('POST', '/messages/conversations', {
    body: { handle, text },
  });
}

/** One conversation of the viewer, as its screen shows it: the other account and the viewer's own state. */
export function fetchConversation(conversationId: string): Promise<ApiResult<ConversationView>> {
  return protectedApiRequest<ConversationView>('GET', conversationPath(conversationId));
}

/** One page of the viewer's conversations, requests or archives, after the cursor of the previous page. */
export function fetchConversations(options: ConversationListOptions = {}): Promise<ApiResult<ConversationPage>> {
  const path = withQuery('/messages/conversations', {
    requests: options.requests ? 'true' : undefined,
    archived: options.archived ? 'true' : undefined,
    cursor: options.cursor,
    limit: options.limit === undefined ? undefined : String(options.limit),
  });
  return protectedApiRequest<ConversationPage>('GET', path);
}

/** One page of the messages of a conversation, newest first, after the cursor of the previous page. */
export function fetchMessages(
  conversationId: string,
  { cursor }: { cursor?: string } = {},
): Promise<ApiResult<MessagePage>> {
  const path = withQuery(`${conversationPath(conversationId)}/messages`, { cursor });
  return protectedApiRequest<MessagePage>('GET', path);
}

/** Writes a message in a conversation the viewer takes part in. */
export function sendMessage(conversationId: string, text: string): Promise<ApiResult<MessageView>> {
  return protectedApiRequest<MessageView>('POST', `${conversationPath(conversationId)}/messages`, { body: { text } });
}

/** Accepts a request waiting for the viewer. */
export function acceptRequest(conversationId: string): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('PUT', `${conversationPath(conversationId)}/accept`);
}

/** Declines a request waiting for the viewer. */
export function declineRequest(conversationId: string): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('PUT', `${conversationPath(conversationId)}/decline`);
}

/** Marks the conversation read up to now. */
export function markConversationRead(conversationId: string): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('PUT', `${conversationPath(conversationId)}/read`);
}

/** Mutes the conversation for the viewer only. Idempotent. */
export function muteConversation(conversationId: string): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('PUT', `${conversationPath(conversationId)}/mute`);
}

/** Unmutes the conversation for the viewer only. Idempotent. */
export function unmuteConversation(conversationId: string): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('DELETE', `${conversationPath(conversationId)}/mute`);
}

/** Archives the conversation for the viewer only. Idempotent. */
export function archiveConversation(conversationId: string): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('PUT', `${conversationPath(conversationId)}/archive`);
}

/** Unarchives the conversation for the viewer only. Idempotent. */
export function unarchiveConversation(conversationId: string): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('DELETE', `${conversationPath(conversationId)}/archive`);
}
