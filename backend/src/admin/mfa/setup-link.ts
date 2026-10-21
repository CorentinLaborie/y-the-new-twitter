import { createHmac, timingSafeEqual } from 'node:crypto';
import { ADMIN_MFA_SETUP_TTL_MS } from '../admin-session';

/**
 * The token of the set-up link sent by e-mail: the account id and the expiry, signed with the server secret. Only the
 * server can issue one, so a password alone cannot start a second-factor set-up (the link goes to the mailbox).
 */
export function issueSetupToken(userId: string, secret: string, now: Date): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, expiresAt: now.getTime() + ADMIN_MFA_SETUP_TTL_MS }),
  ).toString('base64url');

  return `${payload}.${sign(payload, secret)}`;
}

/** The account id of a valid, unexpired token, or null for any other value. */
export function readSetupToken(token: string, secret: string, now: Date): string | null {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined || !sameText(signature, sign(payload, secret))) {
    return null;
  }

  let data: { userId?: unknown; expiresAt?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof data.userId !== 'string' || typeof data.expiresAt !== 'number' || now.getTime() > data.expiresAt) {
    return null;
  }

  return data.userId;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(`admin-mfa-setup:${payload}`).digest('base64url');
}

function sameText(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}
