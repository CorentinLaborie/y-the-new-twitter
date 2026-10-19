const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Per-IP limits of section 9.4 (proposed defaults, DEC-040). An attempt is any request to the endpoint,
 * successful or not. Endpoints that share a policy share one counter per IP address.
 * The per-account limits (failed logins, wrong codes, requests per account) are kept in the database.
 */
export const AUTH_RATE_LIMIT_POLICIES = {
  /** POST /auth/login: 20 attempts per IP in 15 minutes. */
  login: { limit: 20, windowMs: 15 * MINUTE_MS },
  /** POST /auth/signup: 5 per IP per hour. */
  signup: { limit: 5, windowMs: HOUR_MS },
  /** Code checks: signup verify, password reset confirm, e-mail change confirm: 20 per IP per hour. */
  'code-confirm': { limit: 20, windowMs: HOUR_MS },
  /** Code requests: signup resend, password reset request, e-mail change request: 10 per IP per hour. */
  'code-request': { limit: 10, windowMs: HOUR_MS },
} as const;

export type AuthRateLimitPolicy = keyof typeof AUTH_RATE_LIMIT_POLICIES;

/** Metadata key where the decorator stores the policy name. */
export const AUTH_RATE_LIMIT_METADATA = 'auth-rate-limit';
