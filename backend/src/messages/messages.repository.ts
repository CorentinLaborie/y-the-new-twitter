import { Injectable } from '@nestjs/common';
import type { KeysetPosition } from '../common/pagination/keyset-cursor';
import { Prisma, type RequestStatus } from '../database/generated/client/client';
import { PrismaService } from '../database/prisma.service';
import { visibleAccountTo } from '../users/account-visibility';

/** The Prisma client or a transaction opened by the service. */
export type MessagesDb = Prisma.TransactionClient;

/** A conversation with its participants and their public names: the viewer finds its own row and the other one. */
const CONVERSATION_INCLUDE = {
  participants: {
    include: { user: { select: { id: true, handle: true, displayName: true } } },
  },
  // The newest message only: the list shows its text under the other account.
  messages: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: { body: true, senderId: true },
  },
} satisfies Prisma.ConversationInclude;

export type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;

/** A conversation the viewer takes part in, with the viewer's own row of participation. */
export type ParticipationRow = Prisma.ConversationParticipantGetPayload<{
  include: { conversation: { include: typeof CONVERSATION_INCLUDE } };
}>;

/** The keyset of the conversation lists: the time of the last message, then the conversation id, newest first. */
function afterConversation(after: KeysetPosition | undefined): Prisma.ConversationParticipantWhereInput {
  if (after === undefined) {
    return {};
  }

  return {
    OR: [
      { conversation: { lastMessageAt: { lt: after.createdAt } } },
      { conversation: { lastMessageAt: after.createdAt }, conversationId: { lt: after.id } },
    ],
  };
}

/** The keyset of the message lists: the creation time, then the message id, newest first. */
function afterMessage(after: KeysetPosition | undefined): Prisma.MessageWhereInput {
  if (after === undefined) {
    return {};
  }

  return {
    OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }],
  };
}

/** The only place that reads and writes the private conversations, their participants and their messages (section 9). */
@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The recipient, by handle, when the viewer may write to them (active, and no block in either direction, R14). */
  findRecipient(viewerId: string, handle: string) {
    return this.prisma.user.findFirst({
      where: { AND: [{ handle }, visibleAccountTo(viewerId)] },
      select: { id: true, handle: true, displayName: true },
    });
  }

  /** Whether `followerId` follows `followeeId`: the rule that decides if a message is a request (section 9). */
  async follows(followerId: string, followeeId: string): Promise<boolean> {
    const count = await this.prisma.follow.count({ where: { followerId, followeeId } });

    return count > 0;
  }

  /** The conversation between two accounts, by its key (the two ids, sorted, joined by a colon). */
  findByKey(directKey: string) {
    return this.prisma.conversation.findUnique({ where: { directKey }, select: { id: true } });
  }

  /**
   * Opens a direct conversation with its first message, in one transaction: the initiator is accepted, the recipient is
   * accepted when they follow the initiator and waits for a request otherwise.
   */
  createDirect(change: {
    directKey: string;
    initiatorId: string;
    recipientId: string;
    recipientStatus: RequestStatus;
    text: string;
    now: Date;
  }): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          directKey: change.directKey,
          initiatedById: change.initiatorId,
          createdAt: change.now,
          lastMessageAt: change.now,
          participants: {
            create: [
              { userId: change.initiatorId, requestStatus: 'accepted', joinedAt: change.now },
              { userId: change.recipientId, requestStatus: change.recipientStatus, joinedAt: change.now },
            ],
          },
        },
        select: { id: true },
      });
      await tx.message.create({
        data: { conversationId: conversation.id, senderId: change.initiatorId, body: change.text, createdAt: change.now },
      });

      return conversation.id;
    });
  }

  /** The conversation, when the viewer takes part in it and the other participant is one they may write to (R14). */
  findParticipation(viewerId: string, conversationId: string): Promise<ConversationRow | null> {
    return this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: { some: { userId: viewerId } },
        AND: [{ participants: { some: { userId: { not: viewerId }, user: visibleAccountTo(viewerId) } } }],
      },
      include: CONVERSATION_INCLUDE,
    });
  }

  /** Writes a message and moves the time of the last message of its conversation, in one transaction. */
  appendMessage(conversationId: string, senderId: string, text: string, now: Date): Promise<{ id: string; createdAt: Date }> {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: { conversationId, senderId, body: text, createdAt: now },
        select: { id: true, createdAt: true },
      });
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } });

      return message;
    });
  }

  /** How many messages the account wrote in the conversation: a request allows its initiator one message at a time. */
  countMessagesBy(conversationId: string, senderId: string): Promise<number> {
    return this.prisma.message.count({ where: { conversationId, senderId } });
  }

  /** Answers a request: only a request still pending for this participant changes. False when nothing changed. */
  async answerRequest(conversationId: string, userId: string, status: 'accepted' | 'declined'): Promise<boolean> {
    const result = await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId, requestStatus: 'pending' },
      data: { requestStatus: status },
    });

    return result.count === 1;
  }

  /** Marks the conversation read for the viewer, at the given time. */
  markRead(conversationId: string, userId: string, now: Date) {
    return this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: now },
    });
  }

  /**
   * Mutes or unmutes the conversation for the viewer only. Idempotent: a row already in that state is left untouched, so
   * its time is kept.
   */
  setMuted(conversationId: string, userId: string, muted: boolean, now: Date) {
    return this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId, mutedAt: muted ? null : { not: null } },
      data: { mutedAt: muted ? now : null },
    });
  }

  /**
   * Archives or unarchives the conversation for the viewer only. Idempotent: a row already in that state is left
   * untouched, so its time is kept.
   */
  setArchived(conversationId: string, userId: string, archived: boolean, now: Date) {
    return this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId, archivedAt: archived ? null : { not: null } },
      data: { archivedAt: archived ? now : null },
    });
  }

  /**
   * One page of the viewer's conversations: the accepted ones, or the requests waiting for the viewer, either still
   * active (not archived) or archived. Only the conversations whose other participant may still be written to are
   * listed; the newest message comes first.
   */
  listConversations(viewerId: string, requests: boolean, archived: boolean, after: KeysetPosition | undefined, take: number) {
    return this.prisma.conversationParticipant.findMany({
      where: {
        AND: [
          { userId: viewerId, requestStatus: requests ? 'pending' : 'accepted', archivedAt: archived ? { not: null } : null },
          { conversation: { participants: { some: { userId: { not: viewerId }, user: visibleAccountTo(viewerId) } } } },
          afterConversation(after),
        ],
      },
      orderBy: [{ conversation: { lastMessageAt: 'desc' } }, { conversationId: 'desc' }],
      take,
      include: { conversation: { include: CONVERSATION_INCLUDE } },
    });
  }

  /** One page of the messages of a conversation, newest first. */
  listMessages(conversationId: string, after: KeysetPosition | undefined, take: number) {
    return this.prisma.message.findMany({
      where: { AND: [{ conversationId }, afterMessage(after)] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: { id: true, body: true, senderId: true, createdAt: true },
    });
  }
}
