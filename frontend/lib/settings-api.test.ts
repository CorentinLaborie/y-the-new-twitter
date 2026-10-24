import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccount } from './settings-api';

const ACCOUNT = {
  handle: 'alice',
  displayName: 'Alice Martin',
  email: 'alice@example.test',
  status: 'active',
  deletionPurgeAt: null,
};

/** The path and the init of the first fetch call. */
function firstCall(): { path: string; init: RequestInit | undefined } {
  const call = vi.mocked(fetch).mock.calls[0];
  const url = new URL(String(call?.[0]));
  return { path: url.pathname, init: call?.[1] };
}

describe('getAccount', () => {
  beforeEach(() => {
    document.cookie = 'y_csrf=csrf-unit';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the account with a GET on /users/me/account and returns it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(ACCOUNT)),
    );

    const result = await getAccount();

    expect(result).toEqual({ ok: true, status: 200, body: ACCOUNT });
    expect(firstCall().path).toBe('/api/v1/users/me/account');
    expect(firstCall().init?.method).toBe('GET');
  });

  it('returns the problem of a refused read, without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { type: 'about:blank', title: 'Compte suspendu', status: 403, detail: 'Votre compte est suspendu.' },
          { status: 403, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const result = await getAccount();

    expect(result).toMatchObject({ ok: false, problem: { status: 403 } });
  });
});
