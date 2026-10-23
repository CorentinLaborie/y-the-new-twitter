import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFollowList, fetchProfile, fetchProfileQuestions } from './profile-api';

function requestedUrl(): string {
  return String(vi.mocked(fetch).mock.calls[0]?.[0]);
}

describe('the profile calls (L1, L3 section 7.4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the public profile of the handle', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ handle: 'alice' })),
    );

    const result = await fetchProfile('alice');

    expect(requestedUrl()).toContain('/users/alice');
    expect(result).toMatchObject({ ok: true, body: { handle: 'alice' } });
  });

  it('reads one page of the questions, with its cursor when it has one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ questions: [], nextCursor: null })),
    );

    await fetchProfileQuestions('alice', 'abc');

    expect(requestedUrl()).toContain('/users/alice/questions?limit=20&cursor=abc');
  });

  it('reads the followers and the following lists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ items: [], nextCursor: null })),
    );

    await fetchFollowList('alice', 'followers');
    expect(requestedUrl()).toContain('/users/alice/followers?limit=20');

    vi.mocked(fetch).mockClear();
    await fetchFollowList('alice', 'following', 'xyz');
    expect(requestedUrl()).toContain('/users/alice/following?limit=20&cursor=xyz');
  });

  it('gives the 404 of a profile that is not visible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ title: 'Introuvable', detail: 'Compte introuvable.' }, { status: 404 }),
      ),
    );

    const result = await fetchProfile('nobody');

    expect(result).toMatchObject({ ok: false, problem: { status: 404 } });
  });
});
