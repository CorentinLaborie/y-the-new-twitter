import type { Page } from '@playwright/test';
import type { Reply } from './feed-kit';

// Mocked calls of the reports and the blocks (plan L6, section 10). They sit in front of the feed mock: a route
// registered later is tried first, and every call this kit does not answer falls through with route.fallback().

const API_ORIGIN = 'http://localhost:8080';
const BLOCK_PATH = /^\/users\/([^/]+)\/block$/;

// With credentials the browser refuses a wildcard origin: the origin of the request is echoed back, as feed-kit does.
function corsHeaders(origin: string | undefined) {
  return {
    'access-control-allow-origin': origin ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, x-csrf-token, idempotency-key',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

export type ReportCall = {
  body: { questionId?: string; replyId?: string; reason: string; details?: string };
  idempotencyKey: string | null;
  csrf: string | null;
};

export type BlockCall = { method: 'PUT' | 'DELETE'; handle: string; csrf: string | null };

export type BlockedListCall = { cursor: string | null };

export type ReportBlockHandlers = {
  report?: (call: ReportCall) => Reply | Promise<Reply>;
  block?: (call: BlockCall) => Reply | Promise<Reply>;
  blocked?: (call: BlockedListCall) => Reply | Promise<Reply>;
};

/** A blocked account as the list of GET /users/me/blocks sends it. */
export function blockedAccount(handle: string, displayName: string, blockedAt = '2026-10-23T09:00:00.000Z') {
  return { handle, displayName, blockedAt };
}

export async function mockReportBlockApi(page: Page, handlers: ReportBlockHandlers = {}) {
  const reportCalls: ReportCall[] = [];
  const blockCalls: BlockCall[] = [];
  const blockedCalls: BlockedListCall[] = [];

  await page.route(`${API_ORIGIN}/api/v1/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fallback();
      return;
    }

    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const headers = request.headers();
    let reply: Reply | null = null;

    if (request.method() === 'POST' && path === '/reports') {
      const call: ReportCall = {
        body: JSON.parse(request.postData() ?? '{}') as ReportCall['body'],
        idempotencyKey: headers['idempotency-key'] ?? null,
        csrf: headers['x-csrf-token'] ?? null,
      };
      reportCalls.push(call);
      reply = handlers.report
        ? await handlers.report(call)
        : { status: 201, body: { id: 'r-1', status: 'open', createdAt: '2026-10-23T10:00:00.000Z' } };
    } else if (BLOCK_PATH.test(path) && ['PUT', 'DELETE'].includes(request.method())) {
      const [, handle = ''] = BLOCK_PATH.exec(path) ?? [];
      const call: BlockCall = {
        method: request.method() as 'PUT' | 'DELETE',
        handle,
        csrf: headers['x-csrf-token'] ?? null,
      };
      blockCalls.push(call);
      reply = handlers.block ? await handlers.block(call) : { status: 204 };
    } else if (request.method() === 'GET' && path === '/users/me/blocks') {
      const call: BlockedListCall = { cursor: url.searchParams.get('cursor') };
      blockedCalls.push(call);
      reply = handlers.blocked ? await handlers.blocked(call) : { status: 200, body: { items: [], nextCursor: null } };
    }

    if (reply === null) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: reply.status,
      headers: corsHeaders(headers['origin']),
      contentType: 'application/json',
      body: reply.body === undefined ? '' : JSON.stringify(reply.body),
    });
  });

  return { reportCalls, blockCalls, blockedCalls };
}

/** The problem of a refused call, in the Problem Details shape. */
export const reportProblem = (status: number, detail: string): Reply => ({
  status,
  body: { type: 'about:blank', title: detail, status, detail },
});
