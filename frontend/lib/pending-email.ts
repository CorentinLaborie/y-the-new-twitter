/**
 * E-mail address handed from one auth page to the next (signup to code, code to login, forgot-password to confirm).
 * It travels in sessionStorage, not in the URL, so no personal data appears in an address bar, history or log.
 * Storage can be blocked (private mode, browser policy): then nothing is kept and the next page asks for the address.
 * Call these from client code only: the server has no sessionStorage.
 */
export const PENDING_EMAIL_KEY = 'y.pendingEmail';

export function rememberPendingEmail(email: string): void {
  try {
    window.sessionStorage.setItem(PENDING_EMAIL_KEY, email);
  } catch {
    // Storage blocked: the next page starts empty and the user types the address.
  }
}

/** Returns the stored address and removes it, so that a second read (or a reload) finds nothing. */
export function takePendingEmail(): string | null {
  try {
    const email = window.sessionStorage.getItem(PENDING_EMAIL_KEY);
    window.sessionStorage.removeItem(PENDING_EMAIL_KEY);
    return email;
  } catch {
    return null;
  }
}
