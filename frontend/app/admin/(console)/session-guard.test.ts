import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminSession } from '@/lib/admin-api';
import { requireAdminSession } from './session-guard';

// next/navigation.redirect throws in Next.js; the mock throws the same way so the test sees the target.
class RedirectError extends Error {
  constructor(public readonly target: string) {
    super(`NEXT_REDIRECT ${target}`);
  }
}

const cookieValue = { value: 'signed-session-id' as string | undefined };

vi.mock('next/navigation', () => ({
  redirect: (target: string) => {
    throw new RedirectError(target);
  },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'SESSION' && cookieValue.value !== undefined ? { name, value: cookieValue.value } : undefined,
  }),
}));
vi.mock('@/lib/admin-api', () => ({ getAdminSession: vi.fn() }));

const SESSION = {
  user: { handle: 'corentin', displayName: 'Corentin', avatarUrl: null },
  idleExpiresAt: '2026-10-21T12:30:00.000Z',
  expiresAt: '2026-10-21T20:00:00.000Z',
};

async function redirectTargetOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof RedirectError) {
      return error.target;
    }
    throw error;
  }
}

describe('requireAdminSession', () => {
  beforeEach(() => {
    vi.mocked(getAdminSession).mockReset();
    cookieValue.value = 'signed-session-id';
  });

  it('returns the administrator when the API answers with a current session', async () => {
    vi.mocked(getAdminSession).mockResolvedValue({ ok: true, status: 200, body: SESSION });

    await expect(requireAdminSession()).resolves.toEqual(SESSION);
  });

  it('forwards only the SESSION cookie to the API, because the API is another origin', async () => {
    vi.mocked(getAdminSession).mockResolvedValue({ ok: true, status: 200, body: SESSION });

    await requireAdminSession();

    expect(getAdminSession).toHaveBeenCalledWith('SESSION=signed-session-id');
  });

  it('calls the API without a cookie when the visitor has no SESSION cookie', async () => {
    cookieValue.value = undefined;
    vi.mocked(getAdminSession).mockResolvedValue({
      ok: false,
      problem: { status: 401, title: 'Connexion', detail: 'Connexion administrateur requise.' },
    });

    await redirectTargetOf(requireAdminSession());

    expect(getAdminSession).toHaveBeenCalledWith(undefined);
  });

  it('redirects to the admin login when the API answers 401 (no current elevation)', async () => {
    vi.mocked(getAdminSession).mockResolvedValue({
      ok: false,
      problem: { status: 401, title: 'Connexion', detail: 'Connexion administrateur requise.' },
    });

    await expect(redirectTargetOf(requireAdminSession())).resolves.toBe('/admin/login');
  });

  it('redirects to the admin login when the API answers 404 (not an administrator)', async () => {
    vi.mocked(getAdminSession).mockResolvedValue({
      ok: false,
      problem: { status: 404, title: 'Introuvable', detail: 'Introuvable.' },
    });

    await expect(redirectTargetOf(requireAdminSession())).resolves.toBe('/admin/login');
  });
});
