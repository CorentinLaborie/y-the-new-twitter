import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { followFailureMessage, followUser, unfollowUser } from './follows-api';

describe('follow calls', () => {
  beforeEach(() => {
    document.cookie = 'y_csrf=csrf-unit';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PUT follows the account and maps the answer: the handle and the follow state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ handle: 'alice', viewerFollows: true }, { status: 200 })),
    );

    const result = await followUser('alice');

    expect(result).toEqual({ ok: true, status: 200, body: { handle: 'alice', viewerFollows: true } });
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/api\/v1\/users\/alice\/follow$/);
    expect(init?.method).toBe('PUT');
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('csrf-unit');
    expect(new Headers(init?.headers).has('Idempotency-Key')).toBe(false);
  });

  it('DELETE unfollows the account and keeps the 204 answer without a body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    const result = await unfollowUser('alice');

    expect(result).toEqual({ ok: true, status: 204, body: {} });
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/api\/v1\/users\/alice\/follow$/);
    expect(init?.method).toBe('DELETE');
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('csrf-unit');
  });

  it('returns the Problem Details of a refused follow, with its code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { title: 'Compte introuvable', detail: 'Compte introuvable.', code: 'account_suspended' },
          { status: 404 },
        ),
      ),
    );

    const result = await followUser('alice');

    expect(result).toEqual({
      ok: false,
      problem: {
        status: 404,
        title: 'Compte introuvable',
        detail: 'Compte introuvable.',
        code: 'account_suspended',
      },
    });
  });

  it('returns the Problem Details of a refused unfollow, without a code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ title: 'Limite atteinte', detail: 'Trop de requêtes.' }, { status: 429 }),
      ),
    );

    const result = await unfollowUser('alice');

    expect(result).toMatchObject({ ok: false, problem: { status: 429, detail: 'Trop de requêtes.' } });
  });

  it('sends the browser to the session-expired login page when a follow answers 401', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { replace });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ title: 'Non authentifié', detail: 'Session absente.' }, { status: 401 }),
      ),
    );

    const result = await followUser('alice');

    expect(result).toMatchObject({ ok: false, problem: { status: 401 } });
    expect(replace).toHaveBeenCalledWith('/login?reason=session-expired');
  });
});

describe('followFailureMessage', () => {
  it('shows the French text of a known code', () => {
    const problem = {
      status: 403,
      title: 'Interdit',
      detail: 'Account suspended.',
      code: 'account_suspended',
    };

    expect(followFailureMessage(problem, true)).toBe('Votre compte est suspendu.');
  });

  it('says the account was not found on a 404 without a code', () => {
    expect(followFailureMessage({ status: 404, title: 'x', detail: 'x' }, true)).toBe('Compte introuvable.');
  });

  it('says the account is not active on a 403 without a code', () => {
    expect(followFailureMessage({ status: 403, title: 'x', detail: 'x' }, false)).toBe(
      'Votre compte n’est pas actif : vous ne pouvez pas modifier vos suivis pour le moment.',
    );
  });

  it('asks to retry, with the text of the requested change, on other failures', () => {
    const problem = { status: 429, title: 'x', detail: 'x' };

    expect(followFailureMessage(problem, true)).toBe('Le suivi n’a pas été enregistré. Réessayez.');
    expect(followFailureMessage(problem, false)).toBe('Le suivi n’a pas pu être retiré. Réessayez.');
  });
});
