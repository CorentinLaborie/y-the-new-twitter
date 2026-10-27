import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMentionSuggestions } from './mention-api';

describe('fetchMentionSuggestions', () => {
  beforeEach(() => {
    document.cookie = 'y_csrf=csrf-unit';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the suggestions for the handle typed so far', async () => {
    const items = [{ handle: 'Robert44', displayName: 'Robert' }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items }), { status: 200 })));

    const result = await fetchMentionSuggestions('ro');

    expect(result).toMatchObject({ ok: true, body: { items } });
    const call = vi.mocked(fetch).mock.calls[0];
    const url = new URL(String(call?.[0]));
    expect(`${url.pathname}${url.search}`).toBe('/api/v1/mentions/suggestions?q=ro');
  });

  it('asks for every account when nothing is typed after the @', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })));

    await fetchMentionSuggestions('');

    const url = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));
    expect(url.search).toBe('?q=');
  });
});
