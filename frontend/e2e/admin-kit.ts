import type { Page, Route } from '@playwright/test';

// Shared helpers of the back-office end-to-end tests. The back-office API is simulated (the browser calls go through
// page.route; the server-side session check is answered by e2e/session-stub.mjs for the cookie SESSION=e2e-admin).

const API_ORIGIN = 'http://localhost:8080';

/** The session cookie that makes the server-side guard accept the visitor as an administrator (see the stub). */
export const ADMIN_COOKIE = { name: 'SESSION', value: 'e2e-admin', domain: 'localhost', path: '/' } as const;

export type AdminReply = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

export type AdminCall = {
  method: string;
  path: string;
  search: string;
  body: Record<string, unknown> | undefined;
};

type Replies = Record<string, AdminReply | ((call: AdminCall) => AdminReply)>;

/** Problem Details of a refusal, as the back-office API sends them. */
export function adminProblem(status: number, detail: string, headers?: Record<string, string>): AdminReply {
  return {
    status,
    body: { type: 'about:blank', title: 'Erreur', status, detail },
    headers: { ...headers, 'content-type': 'application/problem+json' },
  };
}

/**
 * Simulates the back-office API. Keys are "METHOD /admin/path" (the query string is in `call.search`). A call without
 * a configured reply gets a 404, so a missing reply fails the test visibly. Returns the calls the page made.
 */
export async function mockAdminApi(page: Page, replies: Replies = {}): Promise<AdminCall[]> {
  const calls: AdminCall[] = [];
  await page.route(`${API_ORIGIN}/api/v1/admin/**`, (route) => answer(route, replies, calls));
  // The client makes a safe request before its first mutation (CSRF token): answer it so no backend is reached.
  await page.route(`${API_ORIGIN}/api/v1/status`, (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': route.request().headers()['origin'] ?? '*',
        'access-control-allow-credentials': 'true',
      },
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    }),
  );
  return calls;
}

async function answer(route: Route, replies: Replies, calls: AdminCall[]): Promise<void> {
  const request = route.request();
  // The page runs on another origin than the API: the CORS headers must echo the page origin.
  const cors: Record<string, string> = {
    'access-control-allow-origin': request.headers()['origin'] ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, x-csrf-token',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-expose-headers': 'Retry-After',
  };

  if (request.method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: cors });
    return;
  }

  const url = new URL(request.url());
  const path = url.pathname.replace('/api/v1', '');
  const raw = request.postData();
  const call: AdminCall = {
    method: request.method(),
    path,
    search: url.search,
    body: raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined,
  };
  calls.push(call);

  const configured = replies[`${call.method} ${path}`];
  const reply: AdminReply =
    typeof configured === 'function'
      ? configured(call)
      : (configured ?? adminProblem(404, `Aucune réponse simulée pour ${call.method} ${path}`));

  await route.fulfill({
    status: reply.status,
    headers: { ...cors, ...reply.headers },
    contentType: reply.headers?.['content-type'] ?? 'application/json',
    body: reply.body === undefined ? '' : JSON.stringify(reply.body),
  });
}
