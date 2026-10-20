import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession } from '@/lib/auth-api';
import { Landing } from './landing';
import { LandingGate } from './landing-gate';

// next/navigation.redirect throws in Next.js; the mock throws the same way so the test sees the target.
class RedirectError extends Error {
  constructor(public readonly target: string) {
    super(`NEXT_REDIRECT ${target}`);
  }
}

const cookieValue = { value: null as string | null };

vi.mock('next/navigation', () => ({
  redirect: (target: string) => {
    throw new RedirectError(target);
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'SESSION' && cookieValue.value !== null ? { name, value: cookieValue.value } : undefined,
  }),
}));
vi.mock('@/lib/auth-api', () => ({ getSession: vi.fn() }));

describe('LandingGate', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReset();
    cookieValue.value = 'signed-session-id';
  });

  it('sends a signed-in user to the feed', async () => {
    vi.mocked(getSession).mockResolvedValue({
      ok: true,
      status: 200,
      body: { user: { handle: 'marthe', displayName: 'Marthe', status: 'active', suspensionReason: null } },
    });

    await expect(LandingGate()).rejects.toMatchObject({ target: '/home' });
  });

  it('shows the landing to a guest, forwarding only the SESSION cookie', async () => {
    vi.mocked(getSession).mockResolvedValue({ ok: true, status: 200, body: { user: null } });

    const page = (await LandingGate()) as ReactElement;

    expect(page.type).toBe(Landing);
    expect(getSession).toHaveBeenCalledWith('SESSION=signed-session-id');
  });

  it('shows the landing to a visitor without a session cookie', async () => {
    cookieValue.value = null;
    vi.mocked(getSession).mockResolvedValue({ ok: true, status: 200, body: { user: null } });

    const page = (await LandingGate()) as ReactElement;

    expect(page.type).toBe(Landing);
    expect(getSession).toHaveBeenCalledWith('');
  });

  it('shows the landing, not a crash, when the API cannot be reached', async () => {
    vi.mocked(getSession).mockResolvedValue({
      ok: false,
      problem: { status: 0, title: 'Réseau', detail: 'Le serveur est injoignable.' },
    });

    const page = (await LandingGate()) as ReactElement;

    expect(page.type).toBe(Landing);
  });

  it('does not redirect when the API answers an error', async () => {
    vi.mocked(getSession).mockResolvedValue({
      ok: false,
      problem: { status: 500, title: 'Erreur', detail: 'Une erreur est survenue.' },
    });

    await expect(LandingGate()).resolves.toBeDefined();
  });
});
