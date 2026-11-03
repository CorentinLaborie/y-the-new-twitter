import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import { decodeKeysetCursor, encodeKeysetCursor } from '../common/pagination/keyset-cursor';
import { MessagesRepository, type ConversationRow, type ParticipationRow } from './messages.repository';
import { ConversationListQueryDto, MessageQueryDto, StartConversationDto } from './dto/messages.dto';

const RECIPIENT_NOT_FOUND_MESSAGE = 'Compte introuvable.';
const SELF_MESSAGE = 'Vous ne pouvez pas vous écrire à vous-même.';
const CONVERSATION_NOT_FOUND_MESSAGE = 'Conversation introuvable.';
export const DECLINED_MESSAGE = 'Cette demande a été refusée.';
export const ACCEPT_FIRST_MESSAGE = 'Acceptez la demande avant de répondre.';
export const ONE_MESSAGE_MESSAGE = 'La demande attend une réponse : un seul message à la fois.';
export const NOT_PENDING_MESSAGE = 'Cette demande n’est plus en attente.';

/** The key of a direct conversation: the two account ids, sorted, joined by a colon (one conversation per pair). */
export function directKeyOf(firstId: string, secondId: string): string {
  return [firstId, secondId].sort().join(':');
}

/** A message as the API returns it: its text, its time, and whether the viewer wrote it. */
export interface MessageView {
  id: string;
  text: string;
  createdAt: string;
  mine: boolean;
}

/** A conversation as the viewer sees it: the viewer's request status, the other account, and its unread, muted and archived state. */
export interface ConversationView {
  id: string;
  status: 'pending' | 'accepted' | 'declined';
  initiatedByViewer: boolean;
  other: { handle: string; displayName: string; avatarUrl: string | null };
  lastMessageAt: string;
  /** When the other account last read the conversation, or null when it has not. */
  otherLastReadAt: string | null;
  /** The newest message: its text, and whether the viewer wrote it. Null when the conversation has no message yet. */
  lastMessage: { text: string; mine: boolean } | null;
  unread: boolean;
  muted: boolean;
  archived: boolean;
}

/**
 * Private messages between two accounts (section 9 of the conditions, L7 of the plan). A message to an account that does
 * not follow the sender is a request: the recipient accepts or declines it. Until it is accepted, the initiator may write
 * one message only. Blocks (R14) and inactive accounts hide the conversation from both sides.
 */
@Injectable()
export class MessagesService {
  constructor(private readonly messages: MessagesRepository) {}

  /** Opens the conversation with a handle, or writes to the one already open. Returns the conversation id. */
  async start(
    viewer: SessionUser,
    dto: StartConversationDto,
    now: Date,
  ): Promise<{ conversationId: string }> {
    const recipient = await this.messages.findRecipient(viewer.id, dto.handle);
    if (recipient === null) {
      throw new NotFoundException(RECIPIENT_NOT_FOUND_MESSAGE);
    }
    if (recipient.id === viewer.id) {
      throw new UnprocessableEntityException(SELF_MESSAGE);
    }

    const directKey = directKeyOf(viewer.id, recipient.id);
    const existing = await this.messages.findByKey(directKey);
    if (existing !== null) {
      await this.send(viewer, existing.id, dto.text, now);
      return { conversationId: existing.id };
    }

    const recipientFollowsViewer = await this.messages.follows(recipient.id, viewer.id);
    const conversationId = await this.messages.createDirect({
      directKey,
      initiatorId: viewer.id,
      recipientId: recipient.id,
      recipientStatus: recipientFollowsViewer ? 'accepted' : 'pending',
      text: dto.text,
      now,
    });

    return { conversationId };
  }

  /** Writes a message in a conversation the viewer takes part in. */
  async send(viewer: SessionUser, conversationId: string, text: string, now: Date): Promise<MessageView> {
    const conversation = await this.participation(viewer, conversationId);
    const mine = ownRow(conversation, viewer.id);
    const other = otherRow(conversation, viewer.id);

    if (mine.requestStatus === 'declined' || other.requestStatus === 'declined') {
      throw new ConflictException(DECLINED_MESSAGE);
    }
    if (mine.requestStatus === 'pending') {
      throw new ConflictException(ACCEPT_FIRST_MESSAGE);
    }
    if (
      other.requestStatus === 'pending' &&
      (await this.messages.countMessagesBy(conversationId, viewer.id)) >= 1
    ) {
      throw new ConflictException(ONE_MESSAGE_MESSAGE);
    }

    const message = await this.messages.appendMessage(conversationId, viewer.id, text, now);

    return { id: message.id, text, createdAt: message.createdAt.toISOString(), mine: true };
  }

  /** The viewer accepts a request waiting for them. */
  accept(viewer: SessionUser, conversationId: string): Promise<void> {
    return this.answer(viewer, conversationId, 'accepted');
  }

  /** The viewer declines a request waiting for them. */
  decline(viewer: SessionUser, conversationId: string): Promise<void> {
    return this.answer(viewer, conversationId, 'declined');
  }

  /** The viewer's conversations, or the requests waiting for them, active or archived, the newest message first, in pages. */
  async list(
    viewer: SessionUser,
    query: ConversationListQueryDto,
  ): Promise<{ conversations: ConversationView[]; nextCursor: string | null }> {
    const limit = query.limit;
    const after = query.cursor === undefined ? undefined : decodeKeysetCursor(query.cursor);
    const rows = await this.messages.listConversations(
      viewer.id,
      query.requests === true,
      query.archived === true,
      after,
      limit + 1,
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);

    return {
      conversations: page.map((row) => toConversationView(row, viewer.id)),
      nextCursor:
        rows.length > limit && last !== undefined
          ? encodeKeysetCursor({
              createdAt: last.conversation.lastMessageAt ?? new Date(0),
              id: last.conversationId,
            })
          : null,
    };
  }

  /** One conversation the viewer takes part in, as the lists show it. 404 when the viewer cannot see it. */
  async conversation(viewer: SessionUser, conversationId: string): Promise<ConversationView> {
    const conversation = await this.participation(viewer, conversationId);

    return toConversationView({ ...ownRow(conversation, viewer.id), conversation }, viewer.id);
  }

  /** One page of the messages of a conversation, the newest first. */
  async messagesOf(
    viewer: SessionUser,
    conversationId: string,
    query: MessageQueryDto,
  ): Promise<{ messages: MessageView[]; nextCursor: string | null }> {
    await this.participation(viewer, conversationId);
    const limit = query.limit;
    const after = query.cursor === undefined ? undefined : decodeKeysetCursor(query.cursor);
    const rows = await this.messages.listMessages(conversationId, after, limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);

    return {
      messages: page.map((row) => ({
        id: row.id,
        text: row.body,
        createdAt: row.createdAt.toISOString(),
        mine: row.senderId === viewer.id,
      })),
      nextCursor:
        rows.length > limit && last !== undefined
          ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  /** The viewer has read the conversation up to now. */
  async markRead(viewer: SessionUser, conversationId: string, now: Date): Promise<void> {
    await this.participation(viewer, conversationId);
    await this.messages.markRead(conversationId, viewer.id, now);
  }

  /** The viewer mutes the conversation: its messages still flow, only the viewer's notifications stop (section 9). */
  mute(viewer: SessionUser, conversationId: string, now: Date): Promise<void> {
    return this.setMuted(viewer, conversationId, true, now);
  }

  /** The viewer unmutes the conversation. */
  unmute(viewer: SessionUser, conversationId: string, now: Date): Promise<void> {
    return this.setMuted(viewer, conversationId, false, now);
  }

  /** The viewer archives the conversation: it leaves the default lists, for the viewer only. */
  archive(viewer: SessionUser, conversationId: string, now: Date): Promise<void> {
    return this.setArchived(viewer, conversationId, true, now);
  }

  /** The viewer unarchives the conversation: it comes back in the default lists. */
  unarchive(viewer: SessionUser, conversationId: string, now: Date): Promise<void> {
    return this.setArchived(viewer, conversationId, false, now);
  }

  private async setMuted(
    viewer: SessionUser,
    conversationId: string,
    muted: boolean,
    now: Date,
  ): Promise<void> {
    await this.participation(viewer, conversationId);
    await this.messages.setMuted(conversationId, viewer.id, muted, now);
  }

  private async setArchived(
    viewer: SessionUser,
    conversationId: string,
    archived: boolean,
    now: Date,
  ): Promise<void> {
    await this.participation(viewer, conversationId);
    await this.messages.setArchived(conversationId, viewer.id, archived, now);
  }

  private async answer(
    viewer: SessionUser,
    conversationId: string,
    status: 'accepted' | 'declined',
  ): Promise<void> {
    const conversation = await this.participation(viewer, conversationId);
    if (ownRow(conversation, viewer.id).requestStatus !== 'pending') {
      throw new ConflictException(NOT_PENDING_MESSAGE);
    }
    const answered = await this.messages.answerRequest(conversationId, viewer.id, status);
    if (!answered) {
      throw new ConflictException(NOT_PENDING_MESSAGE);
    }
  }

  /** The conversation, or 404 when the viewer does not take part in it or the other account may not be written to. */
  private async participation(viewer: SessionUser, conversationId: string): Promise<ConversationRow> {
    const conversation = await this.messages.findParticipation(viewer.id, conversationId);
    if (conversation === null) {
      throw new NotFoundException(CONVERSATION_NOT_FOUND_MESSAGE);
    }

    return conversation;
  }
}

/** The viewer's own row of participation in a conversation. */
function ownRow(conversation: ConversationRow, viewerId: string) {
  const row = conversation.participants.find((participant) => participant.userId === viewerId);
  if (row === undefined) {
    throw new Error(`The viewer ${viewerId} takes no part in the conversation ${conversation.id}.`);
  }

  return row;
}

/** The other participant's row of a conversation. */
function otherRow(conversation: ConversationRow, viewerId: string) {
  const row = conversation.participants.find((participant) => participant.userId !== viewerId);
  if (row === undefined) {
    throw new Error(`The conversation ${conversation.id} has no other participant.`);
  }

  return row;
}

/** A row of the conversation list as the viewer sees it. */
function toConversationView(row: ParticipationRow, viewerId: string): ConversationView {
  const conversation = row.conversation;
  const other = conversation.participants.find((participant) => participant.userId !== viewerId);
  const lastMessageAt = conversation.lastMessageAt ?? conversation.createdAt;
  const [latest] = conversation.messages;
  if (other === undefined) {
    throw new Error(`The conversation ${conversation.id} has no other participant.`);
  }

  return {
    id: conversation.id,
    status: row.requestStatus,
    initiatedByViewer: conversation.initiatedById === viewerId,
    other: {
      handle: other.user.handle,
      displayName: other.user.displayName,
      avatarUrl: other.user.avatarUrl,
    },
    lastMessageAt: lastMessageAt.toISOString(),
    otherLastReadAt: other.lastReadAt?.toISOString() ?? null,
    lastMessage: latest === undefined ? null : { text: latest.body, mine: latest.senderId === viewerId },
    unread: row.lastReadAt === null || row.lastReadAt < lastMessageAt,
    muted: row.mutedAt !== null,
    archived: row.archivedAt !== null,
  };
}
