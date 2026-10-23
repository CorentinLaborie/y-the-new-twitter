import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blockAccount, listBlockedAccounts, unblockAccount } from './blocks-api';

/** The path and the init of the first fetch call. */
function firstCall(): { path: string; init: RequestInit | undefined } {
  const call = vi.mocked(fetch).mock.calls[0];
  const url = new URL(String(call?.[0]));
  return { path: `${url.pathname}${url.search}`, init: call?.[1] };
}

describe('block calls', () => {
  beforeEach(() => {
    document.cookie = 'y_csrf=csrf-unit';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('blocks an account with a PUT on its handle, and sends the CSRF token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));

    const result = await blockAccount('bob');

    expect(result).toMatchObject({ ok: true, status: 204 });
    const { path, init } = firstCall();
    expect(path).toBe('/api/v1/users/bob/block');
    expect(init?.method).toBe('PUT');
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('csrf-unit');
  });

  it('lifts the block with a DELETE on the same path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));

    await unblockAccount('bob');

    const { path, init } = firstCall();
    expect(path).toBe('/api/v1/users/bob/block');
    expect(init?.method).toBe('DELETE');
  });

  it('encodes the handle in the path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));

    await blockAccount('a/b');

    expect(firstCall().path).toBe('/api/v1/users/a%2Fb/block');
  });

  it('lists the blocked accounts without query string on the first page', async () => {
    const page = { items: [], nextCursor: null };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(page)));

    const result = await listBlockedAccounts();

    expect(result).toEqual({ ok: true, status: 200, body: page });
    expect(firstCall().path).toBe('/api/v1/users/me/blocks');
  });

  it('sends the cursor and the limit of the next page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: [], nextCursor: null })));

    await listBlockedAccounts({ cursor: 'abc', limit: 10 });

    expect(firstCall().path).toBe('/api/v1/users/me/blocks?cursor=abc&limit=10');
  });
});
