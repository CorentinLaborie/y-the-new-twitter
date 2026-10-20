import type { Request } from 'express';

/**
 * A new session ID before the user is recorded, so an old ID cannot be reused (section 13).
 * Every login path uses it: the user login and the back-office login.
 */
export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}
