import type { Prisma } from '../database/generated/client/client';

/** The Prisma client or a transaction opened by a caller. */
type GraphLockDb = Prisma.TransactionClient;

/**
 * One advisory lock for the whole account graph: the follows, the blocks, the content writes that move a counter, and
 * the status changes. It is taken first in each transaction, before any row lock, so the row locks of two transactions
 * are never taken in opposite orders (the deadlock of a status change and a follow, section 6.3).
 */
const ACCOUNT_GRAPH_LOCK_KEY = 716203;

/**
 * Shared: the follows, blocks and content writes. Several of them run together, and none runs during a status change.
 * Must be the first statement of the transaction.
 */
export function lockAccountGraphShared(db: GraphLockDb) {
  return db.$queryRaw`SELECT pg_advisory_xact_lock_shared(${ACCOUNT_GRAPH_LOCK_KEY}::bigint)::text AS locked`;
}

/**
 * Exclusive: a status change (suspension, lifting, deletion, cancellation, activation, purge). It waits for every shared
 * holder and runs alone. Must be the first statement of the transaction.
 */
export function lockAccountGraphExclusive(db: GraphLockDb) {
  return db.$queryRaw`SELECT pg_advisory_xact_lock(${ACCOUNT_GRAPH_LOCK_KEY}::bigint)::text AS locked`;
}
