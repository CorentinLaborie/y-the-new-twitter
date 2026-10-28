/*
 * The rules and texts of the messages screens (section 9; the design boards Messages-*). Pure functions, so the rules
 * are tested without rendering. The API decides; these functions only show what the viewer may do.
 */

import type { ApiProblem } from '@/lib/api-client';
import type { ConversationListOptions, ConversationView } from '@/lib/messages-api';

/** The longest private message, in characters (DEC-008). The API refuses more. */
export const MESSAGE_MAX_LENGTH = 1000;

/** The three lists of the screen, one per tab. */
export type MessagesTab = 'messages' | 'requests' | 'archived';

export const MESSAGES_TABS: readonly { id: MessagesTab; label: string }[] = [
  { id: 'messages', label: 'Messages' },
  { id: 'requests', label: 'Demandes' },
  { id: 'archived', label: 'Archivées' },
];

/** The list parameters of a tab. The requests tab shows the requests waiting for the viewer. */
export function listOptionsFor(tab: MessagesTab): ConversationListOptions {
  if (tab === 'requests') {
    return { requests: true };
  }
  if (tab === 'archived') {
    return { archived: true };
  }
  return {};
}

/** The short state shown next to a conversation in a list: a request, a refusal, or the mute. Empty for a plain one. */
export function conversationStateLabel(conversation: ConversationView): string {
  if (conversation.status === 'pending') {
    return 'En attente';
  }
  if (conversation.status === 'declined') {
    return 'Refusée';
  }
  return conversation.muted ? 'En sourdine' : '';
}

/**
 * Whether the viewer may write now. A declined conversation is closed. A request waiting for the viewer must be
 * accepted first. A request the viewer sent allows one message only, until it is accepted.
 */
export function canWrite(conversation: ConversationView, viewerHasWritten: boolean): boolean {
  if (conversation.status === 'declined') {
    return false;
  }
  if (conversation.status === 'pending') {
    return conversation.initiatedByViewer && !viewerHasWritten;
  }
  return true;
}

/** The sentence above the composer that explains why the viewer cannot write, or null when they can. */
export function composerNotice(conversation: ConversationView, viewerHasWritten: boolean): string | null {
  if (conversation.status === 'declined') {
    return 'Cette demande a été refusée.';
  }
  if (conversation.status === 'pending' && !conversation.initiatedByViewer) {
    return 'Acceptez la demande avant de répondre.';
  }
  if (conversation.status === 'pending' && viewerHasWritten) {
    return 'La demande attend une réponse : un seul message à la fois.';
  }
  return null;
}

/** The French text shown when the API refuses a message, by HTTP status (decision of 2026-10-27). */
export function sendFailureMessage(problem: ApiProblem): string {
  switch (problem.status) {
    case 404:
      return 'Cette conversation n’est plus disponible.';
    case 409:
      return 'Votre message ne peut pas être envoyé pour le moment. Actualisez la page.';
    case 422:
      return 'Le message ne peut pas être envoyé. Vérifiez sa longueur.';
    case 403:
      return 'Votre compte ne peut pas écrire pour le moment.';
    default:
      return 'Le message n’a pas pu être envoyé. Réessayez.';
  }
}

/** The text of a failed load of a list or of a thread, by HTTP status. */
export function loadFailureMessage(problem: ApiProblem): string {
  return problem.status === 404
    ? 'Cette conversation n’est plus disponible.'
    : 'Les messages n’ont pas pu être chargés. Réessayez.';
}

/** The time shown in a list or a thread: the clock time for today, the date otherwise. */
/** The preview under the other account in a list: the newest text, with « Vous : » when the viewer wrote it. */
export function listPreview(conversation: ConversationView): string {
  if (conversation.lastMessage === null) {
    return '';
  }
  return conversation.lastMessage.mine
    ? `Vous : ${conversation.lastMessage.text}`
    : conversation.lastMessage.text;
}

export function formatMessageTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}
