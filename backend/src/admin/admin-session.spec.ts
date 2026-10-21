import {
  ADMIN_IDLE_TIMEOUT_MS,
  ADMIN_MAX_SESSION_MS,
  ADMIN_MFA_SETUP_TTL_MS,
  ADMIN_REAUTH_WINDOW_MS,
  isElevated,
  isMfaSetupOpen,
  isReauthenticated,
  startElevation,
} from './admin-session';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const MINUTE = 60 * 1000;

describe('admin session limits (DEC-036, DEC-082)', () => {
  it('is not elevated without an elevation', () => {
    expect(isElevated(undefined, NOW)).toBe(false);
  });

  it('stays elevated while the last request is under 30 minutes old', () => {
    const elevation = startElevation(new Date(NOW.getTime() - 60 * MINUTE));
    const lastSeen = {
      ...elevation,
      lastSeenAt: new Date(NOW.getTime() - ADMIN_IDLE_TIMEOUT_MS + MINUTE).toISOString(),
    };

    expect(isElevated(lastSeen, NOW)).toBe(true);
  });

  it('is not elevated after 30 minutes without a request', () => {
    const elevation = startElevation(new Date(NOW.getTime() - 10 * MINUTE));
    const lastSeen = {
      ...elevation,
      lastSeenAt: new Date(NOW.getTime() - ADMIN_IDLE_TIMEOUT_MS - 1).toISOString(),
    };

    expect(isElevated(lastSeen, NOW)).toBe(false);
  });

  it('is not elevated 8 hours after the login, even with recent requests', () => {
    const verifiedAt = new Date(NOW.getTime() - ADMIN_MAX_SESSION_MS - 1);
    const elevation = { ...startElevation(verifiedAt), lastSeenAt: NOW.toISOString() };

    expect(isElevated(elevation, NOW)).toBe(false);
  });

  it('keeps the set-up of the second factor open for 15 minutes only', () => {
    const startedAt = new Date(NOW.getTime() - ADMIN_MFA_SETUP_TTL_MS).toISOString();

    expect(isMfaSetupOpen({ userId: 'admin-1', secretEncrypted: 'x', startedAt }, NOW)).toBe(true);
    expect(
      isMfaSetupOpen(
        {
          userId: 'admin-1',
          secretEncrypted: 'x',
          startedAt: new Date(NOW.getTime() - ADMIN_MFA_SETUP_TTL_MS - 1).toISOString(),
        },
        NOW,
      ),
    ).toBe(false);
    expect(isMfaSetupOpen(undefined, NOW)).toBe(false);
  });

  it('counts a re-authentication as current for 10 minutes only (DEC-088)', () => {
    const reauthAt = new Date(NOW.getTime() - ADMIN_REAUTH_WINDOW_MS).toISOString();

    expect(isReauthenticated(reauthAt, NOW)).toBe(true);
    expect(isReauthenticated(new Date(NOW.getTime() - ADMIN_REAUTH_WINDOW_MS - 1).toISOString(), NOW)).toBe(
      false,
    );
  });

  it('is never current without a re-authentication', () => {
    expect(isReauthenticated(undefined, NOW)).toBe(false);
  });
});
