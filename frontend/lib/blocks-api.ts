/*
 * Client of the block API (plan L6, S4). Contract: backend/openapi.yaml (tag Blocks), served under /api/v1.
 *
 * PUT /users/{handle}/block      204. 404 unknown or inactive account. 422 the viewer's own account.
 * DELETE /users/{handle}/block   204, also when there was no block.
 * GET /users/me/blocks[?cursor=…&limit=…]   200 BlockPage, most recent block first.
 *   limit: 1 to 50, default 20. cursor: the nextCursor of the previous page.
 *
 * As the other clients (lib/replies-api.ts), each function returns an ApiResult (lib/api-client.ts): the body on
 * success, the ApiProblem on any 4xx or 5xx answer. Nothing is thrown.
 */

import type { ApiResult } from '@/lib/api-client';
import { protectedApiRequest } from '@/lib/session-expired';

/** One blocked account, with the time of its block. */
export type BlockedAccount = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  blockedAt: string;
};

/** One page of blocked accounts. `nextCursor` is null on the last page. */
export type BlockPage = { items: BlockedAccount[]; nextCursor: string | null };

function blockPath(handle: string): string {
  return `/users/${encodeURIComponent(handle)}/block`;
}

/** Blocks the account (204). Blocking it again changes nothing. */
export function blockAccount(handle: string): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('PUT', blockPath(handle));
}

/** Lifts the block of the account (204), whether or not there was one. */
export function unblockAccount(handle: string): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('DELETE', blockPath(handle));
}

/** One page of the accounts the viewer blocks. Without `cursor` it is the first page. */
export function listBlockedAccounts({ cursor, limit }: { cursor?: string; limit?: number } = {}): Promise<
  ApiResult<BlockPage>
> {
  const query = new URLSearchParams();
  if (cursor) {
    query.set('cursor', cursor);
  }
  if (limit !== undefined) {
    query.set('limit', String(limit));
  }
  const search = query.toString();
  return protectedApiRequest<BlockPage>('GET', `/users/me/blocks${search ? `?${search}` : ''}`);
}
