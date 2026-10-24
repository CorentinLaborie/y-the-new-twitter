import type { Page } from '@playwright/test';
import type { Reply } from './feed-kit';

// Mocked calls of the settings (plan L5, step 4): the account and the sign-out. They sit in front of the feed mock:
// a route registered later is tried first, and every call this kit does not answer falls through with route.fallback().

const API_ORIGIN = 'http://localhost:8080';

export type SettingsHandlers = {
  account?: () => Reply | Promise<Reply>;
  logout?: () => Reply | Promise<Reply>;
  password?: (body: { currentPassword: string; newPassword: string }) => Reply | Promise<Reply>;
  emailRequest?: (body: { newEmail: string; password: string }) => Reply | Promise<Reply>;
  emailResend?: () => Reply | Promise<Reply>;
  emailConfirm?: (body: { code: string }) => Reply | Promise<Reply>;
  deletion?: (body: { reasonCode: string; email: string }) => Reply | Promise<Reply>;
};

/** The account as GET /users/me/account sends it. */
export function accountOf(overrides: Partial<{ handle: string; displayName: string; email: string }> = {}) {
  return {
    handle: 'alice',
    displayName: 'Alice Martin',
    email: 'alice@example.test',
    status: 'active',
    deletionPurgeAt: null,
    ...overrides,
  };
}

function corsHeaders(origin: string | undefined) {
  return {
    'access-control-allow-origin': origin ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, x-csrf-token, idempotency-key',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

export async function mockSettingsApi(page: Page, handlers: SettingsHandlers = {}) {
  const logoutCalls: string[] = [];
  const passwordCalls: { currentPassword: string; newPassword: string }[] = [];
  const emailRequestCalls: { newEmail: string; password: string }[] = [];
  const emailConfirmCalls: string[] = [];
  const deletionCalls: { reasonCode: string; email: string }[] = [];

  await page.route(`${API_ORIGIN}/api/v1/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fallback();
      return;
    }

    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    let reply: Reply | null = null;

    if (request.method() === 'GET' && path === '/users/me/account') {
      reply = handlers.account ? await handlers.account() : { status: 200, body: accountOf() };
    } else if (request.method() === 'PUT' && path === '/users/me/password') {
      const body = JSON.parse(request.postData() ?? '{}') as { currentPassword: string; newPassword: string };
      passwordCalls.push(body);
      reply = handlers.password ? await handlers.password(body) : { status: 204 };
    } else if (request.method() === 'POST' && path === '/auth/email-change/request') {
      const body = JSON.parse(request.postData() ?? '{}') as { newEmail: string; password: string };
      emailRequestCalls.push(body);
      reply = handlers.emailRequest ? await handlers.emailRequest(body) : { status: 202 };
    } else if (request.method() === 'POST' && path === '/auth/email-change/resend') {
      reply = handlers.emailResend ? await handlers.emailResend() : { status: 202 };
    } else if (request.method() === 'POST' && path === '/auth/email-change/confirm') {
      const body = JSON.parse(request.postData() ?? '{}') as { code: string };
      emailConfirmCalls.push(body.code);
      reply = handlers.emailConfirm ? await handlers.emailConfirm(body) : { status: 200 };
    } else if (request.method() === 'PUT' && path === '/users/me/deletion') {
      const body = JSON.parse(request.postData() ?? '{}') as { reasonCode: string; email: string };
      deletionCalls.push(body);
      reply = handlers.deletion ? await handlers.deletion(body) : { status: 200, body: { deletionPurgeAt: '2027-01-21T10:00:00.000Z' } };
    } else if (request.method() === 'POST' && path === '/auth/logout') {
      logoutCalls.push(path);
      reply = handlers.logout ? await handlers.logout() : { status: 204 };
    }

    if (reply === null) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: reply.status,
      headers: corsHeaders(request.headers()['origin']),
      contentType: 'application/json',
      body: reply.body === undefined ? '' : JSON.stringify(reply.body),
    });
  });

  return { logoutCalls, passwordCalls, emailRequestCalls, emailConfirmCalls, deletionCalls };
}

/** A problem of a refused call, in the Problem Details shape. */
export const settingsProblem = (status: number, detail: string): Reply => ({
  status,
  body: { type: 'about:blank', title: detail, status, detail },
});
