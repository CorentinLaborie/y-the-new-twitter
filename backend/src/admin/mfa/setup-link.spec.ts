import { ADMIN_MFA_SETUP_TTL_MS } from '../admin-session';
import { issueSetupToken, readSetupToken } from './setup-link';

const SECRET = 'server-secret-for-tests';
const NOW = new Date('2026-10-21T10:00:00.000Z');

describe('setup link token', () => {
  it('reads back the account id while the token is inside its delay', () => {
    const token = issueSetupToken('admin-1', SECRET, NOW);

    expect(readSetupToken(token, SECRET, NOW)).toBe('admin-1');
    expect(readSetupToken(token, SECRET, new Date(NOW.getTime() + ADMIN_MFA_SETUP_TTL_MS))).toBe('admin-1');
  });

  it('refuses a token after its delay', () => {
    const token = issueSetupToken('admin-1', SECRET, NOW);

    expect(readSetupToken(token, SECRET, new Date(NOW.getTime() + ADMIN_MFA_SETUP_TTL_MS + 1))).toBeNull();
  });

  it('refuses a token signed with another secret', () => {
    const token = issueSetupToken('admin-1', 'another-secret', NOW);

    expect(readSetupToken(token, SECRET, NOW)).toBeNull();
  });

  it('refuses a token whose account id was changed, since the signature covers it', () => {
    const [, signature] = issueSetupToken('admin-1', SECRET, NOW).split('.');
    const forged = Buffer.from(JSON.stringify({ userId: 'admin-2', expiresAt: NOW.getTime() + 60_000 })).toString(
      'base64url',
    );

    expect(readSetupToken(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it.each(['', 'not-a-token', 'a.b.c', '.', 'eyJ9.x'])('refuses the malformed value %j', (value) => {
    expect(readSetupToken(value, SECRET, NOW)).toBeNull();
  });
});
