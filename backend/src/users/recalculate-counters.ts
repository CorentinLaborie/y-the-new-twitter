import { Prisma } from '../database/generated/client/client';

/** The Prisma client or a transaction opened by a caller, on the application or the maintenance account. */
type CountersDb = Prisma.TransactionClient;

/**
 * Recounts the follower and following counts of these accounts from the follow rows, counting only the active accounts
 * at both ends (R13, DEC-086). The rows are locked first, in the order of their ids, the order the follow transactions
 * take them (section 6.3), so a recount and a follow never wait on each other in opposite orders.
 */
export async function recountFollowCounters(db: CountersDb, userIds: readonly string[]): Promise<void> {
  const ids = [...new Set(userIds)].sort();
  if (ids.length === 0) {
    return;
  }
  const idList = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
  await db.$queryRaw`SELECT id FROM users WHERE id IN (${idList}) ORDER BY id FOR UPDATE`;
  await db.$executeRaw`
    UPDATE users AS u SET
      follower_count = (SELECT count(*) FROM follows f JOIN users a ON a.id = f.follower_id
                        WHERE f.followee_id = u.id AND a.status = 'active'),
      following_count = (SELECT count(*) FROM follows f JOIN users a ON a.id = f.followee_id
                         WHERE f.follower_id = u.id AND a.status = 'active')
    WHERE u.id IN (${idList})`;
}

/**
 * Brings the counters that depend on this account back to what the active accounts give (R13): the Y, like and
 * dislike counts of the questions and the reply count of the questions this account reacted to or replied under,
 * and the like and dislike counts of the replies it reacted to. Only active accounts are counted, and deleted
 * replies are not. The follow counters of this account and of the accounts it follows or that follow it are recounted
 * too. Every status change calls it in the same transaction, after writing the new status. The retention purge calls
 * it too, on the maintenance account (R16).
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

  const links = await db.follow.findMany({
    where: { OR: [{ followerId: userId }, { followeeId: userId }] },
    select: { followerId: true, followeeId: true },
  });
  await recountFollowCounters(db, [userId, ...links.flatMap((link) => [link.followerId, link.followeeId])]);
}
