import { expect, type Page, type Route } from '@playwright/test';

// Shared helpers of the auth end-to-end tests (DEC-139: the account API is simulated, no real server is called).
// Every request to /api/v1/auth/** is answered here and recorded, so that a test can check what the page sent.

export const API_ORIGIN = 'http://localhost:8080';

// Labels, buttons and messages as the pages show them (checked against the integrated pages).
export const ui = {
  handle: 'Identifiant',
  displayName: 'Nom affiché (obligatoire)',
  email: 'Adresse e-mail',
  signupEmail: 'E-mail',
  password: 'Mot de passe',
  passwordConfirm: 'Confirmer le mot de passe',
  newPassword: 'Nouveau mot de passe',
  birthDate: 'Date de naissance',
  code: 'Code à 6 chiffres',
  signupCode: 'Entrez le code reçu par e-mail',
  terms: 'J’accepte les Conditions d’utilisation de Y',
  submitSignup: 'Créer mon compte',
  submitCode: 'Valider mon compte',
  resendCode: 'Renvoyer le code',
  resentMessage: /nouveau code/i,
  submitLogin: 'Se connecter',
  verifyLink: /Saisir mon code/i,
  submitForgot: 'Envoyer le code',
  submitReset: 'Changer mon mot de passe',
} as const;

// The notice of a form. Next.js adds its own role="alert" announcer to every page, so it is excluded here.
export function notice(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

export type ApiCall = { method: string; path: string; body: Record<string, unknown> | undefined };

export type Reply = {
  status: number;
  body?: unknown;
  contentType?: string;
  headers?: Record<string, string>;
};

// A reply is fixed, or computed from the call (to simulate a session that changes after login).
export type Replies = Record<string, Reply | ((call: ApiCall) => Reply)>;

// Problem Details (application/problem+json) as the account API sends them on errors.
export function problem(status: number, detail: string, headers?: Record<string, string>): Reply {
  return {
    status,
    body: { type: 'about:blank', title: 'Erreur', status, detail },
    contentType: 'application/problem+json',
    headers,
  };
}

// Mocks the account API. Unknown calls get a 404 so that a missing reply fails the test visibly.
// GET /auth/session answers "no session" unless a test overrides it.
export async function mockAuthApi(page: Page, replies: Replies = {}): Promise<ApiCall[]> {
  const calls: ApiCall[] = [];
  await page.route(`${API_ORIGIN}/api/v1/auth/**`, (route) => answer(route, replies, calls));
  return calls;
}

async function answer(route: Route, replies: Replies, calls: ApiCall[]): Promise<void> {
  const request = route.request();
  // The page runs on another origin than the API: the CORS headers must echo the page origin.
  const cors: Record<string, string> = {
    'access-control-allow-origin': request.headers()['origin'] ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, x-csrf-token',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    // Retry-After is not readable by the page without this header (the page is on another origin).
    'access-control-expose-headers': 'Retry-After',
  };

  if (request.method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: cors });
    return;
  }

  const path = new URL(request.url()).pathname.replace('/api/v1', '');
  const raw = request.postData();
  const call: ApiCall = {
    method: request.method(),
    path,
    body: raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined,
  };
  calls.push(call);

  const key = `${call.method} ${path}`;
  const configured = replies[key];
  let reply: Reply;
  if (configured) {
    reply = typeof configured === 'function' ? configured(call) : configured;
  } else if (key === 'GET /auth/session') {
    reply = { status: 200, body: { user: null } };
  } else {
    reply = problem(404, `Aucune réponse simulée pour ${key}`);
  }

  await route.fulfill({
    status: reply.status,
    headers: { ...cors, ...reply.headers },
    contentType: reply.contentType ?? 'application/json',
    body: reply.body === undefined ? '' : JSON.stringify(reply.body),
  });
}

// Body of the first call made to "METHOD /path"; the test fails if the page never made that call.
export function bodyOf(calls: ApiCall[], key: string): Record<string, unknown> {
  const call = calls.find((candidate) => `${candidate.method} ${candidate.path}` === key);
  if (!call?.body) {
    throw new Error(`No body recorded for ${key}`);
  }
  return call.body;
}

// The page moved to the code page for this e-mail address.
export async function expectCodePage(page: Page, email: string): Promise<void> {
  await expect(page).toHaveURL(/\/signup\/code\?/);
  const url = new URL(page.url());
  expect(url.pathname).toBe('/signup/code');
  expect(url.searchParams.get('email')).toBe(email);
}
