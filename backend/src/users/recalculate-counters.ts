import type { Prisma } from '../database/generated/client/client';

/** The Prisma client or a transaction opened by a caller, on the application or the maintenance account. */
type CountersDb = Prisma.TransactionClient;

/**
 * Brings the counters that depend on this account back to what the active accounts give (R13): the Y, like and
 * dislike counts of the questions and the reply count of the questions this account reacted to or replied under,
 * and the like and dislike counts of the replies it reacted to. Only active accounts are counted, and deleted
 * replies are not. Every status change calls it in the same transaction, after writing the new status. The retention
 * purge calls it too, on the maintenance account (R16).
 */
export async function recalculateCounters(db: CountersDb, userId: string): Promise<void> {
  // Replies first, then questions: a reply deletion locks its reply, then its question, and the recalculation
  // takes the rows in the same order, so the two cannot wait for each other.
  await db.$executeRaw`
    UPDATE replies AS rp SET
      like_count = (SELECT count(*) FROM reply_reactions r JOIN users u ON u.id = r.user_id
                    WHERE r.reply_id = rp.id AND r.kind = 'like' AND u.status = 'active'),
      dislike_count = (SELECT count(*) FROM reply_reactions r JOIN users u ON u.id = r.user_id
                       WHERE r.reply_id = rp.id AND r.kind = 'dislike' AND u.status = 'active')
    WHERE rp.id IN (SELECT reply_id FROM reply_reactions WHERE user_id = ${userId}::uuid)`;
  await db.$executeRaw`
    UPDATE questions AS q SET
      like_count = (SELECT count(*) FROM question_reactions r JOIN users u ON u.id = r.user_id
                    WHERE r.question_id = q.id AND r.kind = 'like' AND u.status = 'active'),
      dislike_count = (SELECT count(*) FROM question_reactions r JOIN users u ON u.id = r.user_id
                       WHERE r.question_id = q.id AND r.kind = 'dislike' AND u.status = 'active'),
      y_count = (SELECT count(*) FROM question_reactions r JOIN users u ON u.id = r.user_id
                 WHERE r.question_id = q.id AND r.kind = 'y' AND u.status = 'active'),
      reply_count = (SELECT count(*) FROM replies rp JOIN users u ON u.id = rp.author_id
                     WHERE rp.question_id = q.id AND rp.deleted_at IS NULL AND u.status = 'active')
    WHERE q.id IN (
      SELECT question_id FROM question_reactions WHERE user_id = ${userId}::uuid
      UNION
      SELECT question_id FROM replies WHERE author_id = ${userId}::uuid)`;
}
