import type { Prisma } from '../../database/generated/client/client';
import { lockAccountGraphExclusive } from '../../users/account-graph-lock';
import { recalculateCounters } from '../../users/recalculate-counters';

/** The maintenance client or a transaction of it: the purge runs on the maintenance account only (DEC-059). */
export type ErasureDb = Prisma.TransactionClient;

/** Shown as the name of an erased account (DEC-029, R16). */
export const ERASED_DISPLAY_NAME = 'Compte supprimé';

/** A password hash no password can match: a malformed hash is refused by verifyPassword. */
const UNUSABLE_PASSWORD_HASH = '!erased';

/** Ids are random, so the placeholders are unique, and the handle is freed (DEC-029). */
function placeholderHandle(userId: string): string {
  return `deleted_${userId.replace(/-/g, '').slice(0, 20)}`;
}

function placeholderEmail(userId: string): string {
  return `deleted-${userId}@erased.invalid`;
}

function ids(rows: { id: string }[]): string[] {
  return rows.map((row) => row.id);
}

/**
 * Erases one account in the caller's transaction (R16, DEC-024, DEC-067). Returns false, and writes nothing, when the
 * account is not pending deletion any more or its window is still open. The row stays with status 'deleted', so that
 * the content and the foreign keys that point at it keep a valid target.
 */
export async function eraseAccount(db: ErasureDb, userId: string, now: Date): Promise<boolean> {
  await lockAccountGraphExclusive(db);
  const closed = await db.user.updateMany({
    where: { id: userId, status: 'pending_deletion', deletionPurgeAt: { lte: now } },
    data: {
      status: 'deleted',
      statusChangedAt: now,
      deletedAt: now,
      handle: placeholderHandle(userId),
      displayName: ERASED_DISPLAY_NAME,
      email: placeholderEmail(userId),
      deletionEmail: null,
      deletionReason: null,
      phone: null,
      passwordHash: UNUSABLE_PASSWORD_HASH,
      birthDate: null,
      bio: null,
      avatarUrl: null,
      suspensionReason: null,
      role: 'user',
      failedLoginCount: 0,
      lockedUntil: null,
      followerCount: 0,
      followingCount: 0,
    },
  });
  if (closed.count !== 1) {
    return false;
  }

  // The status is written first: the counters then leave out this account, and its reactions and replies.
  await recalculateCounters(db, userId);

  // Content (DEC-067): the links go, the content is hidden, then the text is emptied. A deleted row must come before
  // its empty body, as the body constraint requires.
  const questionIds = ids(await db.question.findMany({ where: { authorId: userId }, select: { id: true } }));
  const replyIds = ids(await db.reply.findMany({ where: { authorId: userId }, select: { id: true } }));
  await db.questionHashtag.deleteMany({ where: { questionId: { in: questionIds } } });
  await db.mention.deleteMany({
    where: {
      OR: [{ questionId: { in: questionIds } }, { replyId: { in: replyIds } }, { mentionedUserId: userId }],
    },
  });
  await db.question.updateMany({ where: { authorId: userId, deletedAt: null }, data: { deletedAt: now } });
  await db.question.updateMany({ where: { authorId: userId }, data: { body: '' } });
  await db.reply.updateMany({ where: { authorId: userId, deletedAt: null }, data: { deletedAt: now } });
  await db.reply.updateMany({ where: { authorId: userId }, data: { body: '' } });

  // Private messages (DEC-029): the messages stay in the conversations of the others, their sender is the placeholder
  // account, and their text is emptied. Contact threads (DEC-024, DEC-080) go with their messages (DEC-119).
  await db.message.updateMany({ where: { senderId: userId }, data: { body: '' } });
  await db.supportMessage.deleteMany({ where: { thread: { userId } } });
  await db.supportThread.deleteMany({ where: { userId } });

  await db.questionReaction.deleteMany({ where: { userId } });
  await db.replyReaction.deleteMany({ where: { userId } });

  // The follow counters of the other accounts were recounted above, while the links still exist (R13); then the links (R16).
  await db.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followeeId: userId }] } });
  // The links are gone, so this account has no follower and follows nobody: the recount above counted them (R16).
  await db.user.updateMany({ where: { id: userId }, data: { followerCount: 0, followingCount: 0 } });
  await db.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });

  await db.bookmark.deleteMany({ where: { userId } });
  await db.notification.deleteMany({ where: { OR: [{ recipientId: userId }, { actorId: userId }] } });
  await db.notificationPreference.deleteMany({ where: { userId } });
  await db.conversationParticipant.deleteMany({ where: { userId } });
  await db.ageVerification.deleteMany({ where: { userId } });

  // Codes, sessions, idempotency keys and login events of the account (DEC-065).
  await db.signupCode.deleteMany({ where: { userId } });
  await db.passwordResetCode.deleteMany({ where: { userId } });
  await db.emailChangeCode.deleteMany({ where: { userId } });
  await db.session.deleteMany({ where: { userId } });
  await db.idempotencyKey.deleteMany({ where: { userId } });
  await db.loginEvent.deleteMany({ where: { userId } });

  return true;
}
