import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession } from '@/lib/auth-api';
import { requireSession } from './session-guard';

// next/navigation.redirect throws in Next.js; the mock throws the same way so the test sees the target.
class RedirectError extends Error {
  constructor(public readonly target: string) {
    super(`NEXT_REDIRECT ${target}`);
  }
}

const requestedPath = { value: null as string | null };

vi.mock('next/navigation', () => ({
  redirect: (target: string) => {
    throw new RedirectError(target);
  },
}));
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => (name === 'x-pathname' ? requestedPath.value : null) }),
  cookies: async () => ({
    get: (name: string) => (name === 'SESSION' ? { name, value: 'signed-session-id' } : undefined),
  }),
}));
vi.mock('@/lib/auth-api', () => ({ getSession: vi.fn() }));

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

describe('requireSession', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReset();
    requestedPath.value = null;
  });

  it('returns the user when the API reports a session', async () => {
    vi.mocked(getSession).mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        user: {
          handle: 'marthe',
          displayName: 'Marthe',
          avatarUrl: null,
          status: 'active',
          suspensionReason: null,
        },
      },
    });

    await expect(requireSession()).resolves.toEqual({
      handle: 'marthe',
      displayName: 'Marthe',
      avatarUrl: null,
      status: 'active',
      suspensionReason: null,
    });
  });

  it('forwards only the SESSION cookie to the API, because the API is another origin', async () => {
    vi.mocked(getSession).mockResolvedValue({ ok: true, status: 200, body: { user: null } });

    await redirectTargetOf(requireSession());

    expect(getSession).toHaveBeenCalledWith('SESSION=signed-session-id');
  });

  it('redirects to /login with the session-expired reason, keeping the requested protected page, when there is no user', async () => {
    vi.mocked(getSession).mockResolvedValue({ ok: true, status: 200, body: { user: null } });
    requestedPath.value = '/home';

    await expect(redirectTargetOf(requireSession())).resolves.toBe(
      '/login?reason=session-expired&next=%2Fhome',
    );
  });

  it('redirects to /login with the session-expired reason alone when the requested path is missing', async () => {
    vi.mocked(getSession).mockResolvedValue({ ok: true, status: 200, body: { user: null } });

    await expect(redirectTargetOf(requireSession())).resolves.toBe('/login?reason=session-expired');
  });

  it('fails closed to /login with the session-expired reason when the API cannot be reached', async () => {
    vi.mocked(getSession).mockResolvedValue({
      ok: false,
      problem: { status: 0, title: 'Réseau', detail: 'Le serveur est injoignable.' },
    });

    await expect(redirectTargetOf(requireSession())).resolves.toBe('/login?reason=session-expired');
  });

  it('never redirects a request that has a session', async () => {
    vi.mocked(getSession).mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        user: {
          handle: 'marthe',
          displayName: 'Marthe',
          avatarUrl: null,
          status: 'active',
          suspensionReason: null,
        },
      },
    });
    requestedPath.value = '/home';

    await expect(redirectTargetOf(requireSession())).resolves.toBeNull();
  });
});
