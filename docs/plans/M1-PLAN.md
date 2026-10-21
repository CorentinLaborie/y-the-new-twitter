# M1 — Accounts: build plan

> **Status (2026-10-19):** decisions validated (DEC-136 to DEC-141). Building locally. Steps are validated one by one, and each validated step is committed on its own (owner rule).
>
> **Not done in M1, on purpose:** a real age-provider check (none chosen, DEC-216), the Brevo account (on hold, DEC-110), the settings screens (M7, DEC-140), and the CI and staging steps of M0 (8 to 12, 15), which wait for the end.

Exit criteria (roadmap, section 18): end-to-end signup and login tests pass; rate limiting (section 9.4) active and tested.

## Decisions taken

| Topic | Decision | Journal |
|---|---|---|
| CSRF cookie name | `y_csrf` and header `X-CSRF-Token`; section 13 corrected | DEC-138 |
| Password policy | At least 8 characters, one digit, one special character; argon2id | DEC-136 |
| Codes | 6 digits, hashed with argon2, expiry, 5 attempts, single use | DEC-137 |
| Unverified account | Cannot log in until the e-mail code is validated | DEC-137 |
| Signup order | E-mail code, then age check | DEC-137 |
| Age | Declared birth date, under 18 refused, no external provider | DEC-137, DEC-216 |
| Tests | Supertest reads the capture outbox for codes; Playwright uses a mocked API | DEC-139 |
| Settings screens | Endpoints in M1, screens in M7 | DEC-140 |
| Rate limits and Brevo | Account counters in the database, IP limits in memory; Brevo adapter tested with a fake HTTP, never called locally | DEC-141 |

## API contract (M1)

Base path `/api/v1`. Errors are Problem Details (`application/problem+json`). Cookies: `SESSION` (HTTP-only, SameSite=Lax) and `y_csrf` (read by the frontend, sent back as `X-CSRF-Token` on every mutation, DEC-138).

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `POST /auth/signup` | `handle`, `displayName`, `email`, `password`, `birthDate` (YYYY-MM-DD), `termsAccepted: true`, `termsVersion: "1.0"`, optional `phone` | 202, empty body, **the same whether the e-mail exists or not** | 400/422 rule violations; 409 when the handle is taken |
| `POST /auth/signup/verify` | `email`, `code` | 200, account `active`, age check run (declared birth date) | 422 wrong, expired or exhausted code; 422 age refused |
| `POST /auth/signup/resend` | `email` | 202, empty body, same answer in every case | 429 |
| `POST /auth/login` | `email`, `password` | 200 `{ user: { handle, displayName } }` and a `SESSION` cookie | 401 generic "Identifiants incorrects"; 403 account not verified; 429 with `Retry-After` when locked or too many attempts |
| `POST /auth/logout` | none | 204 | |
| `GET /auth/session` | none | 200 `{ user: { handle, displayName } \| null }` | |
| `POST /auth/password-reset/request` | `email` | 202, empty body, same answer in every case | 429 |
| `POST /auth/password-reset/confirm` | `email`, `code`, `password` | 200 | 422 wrong code or password refused |
| `POST /auth/email-change/request` | `newEmail` (logged-in, active user) | 202, empty body | 401 not logged in; 429 |
| `POST /auth/email-change/confirm` | `code` (logged-in, active user) | 200 | 401; 422 wrong code |

Rules: the handle is ASCII, 30 characters at most, unique regardless of case. The e-mail is stored in lower case. A wrong code counts as an attempt; the fifth wrong attempt invalidates the code. Every attempt at login is written to `login_events` (DEC-141 for the limits).

## Backend (M1-B)

### Foundations
| # | Task | Done when |
|---|---|---|
| B1 | Install `argon2` (pinned) and check the build on Node 24 | Build passes |
| B2 | Password service: argon2id, policy of DEC-136 | Unit tests |
| B3 | Code service: random 6 digits, argon2 hash, TTL `Y_CODE_TTL_MINUTES`, 5 attempts, single use | Unit tests |
| B4 | Users repository: create, find by e-mail and by handle (case-insensitive) | Integration tests on PostgreSQL |
| B5 | Input validation: handle (ASCII, 30, reserved words), display name (50), e-mail (254, lower case), optional phone (normalised), birth date, terms version `1.0`, password policy | Unit tests |
| B6 | Error format and status codes of section 8.4 (400, 401, 409, 422, 429) | Tests |

### Signup
| # | Task | Done when |
|---|---|---|
| B7 | `POST /auth/signup`: creates a `pending_verification` account, sends the code. Same answer whether the e-mail exists or not (section 9.4) | Test |
| B8 | `POST /auth/signup/verify`: checks the code, 5 attempts, moves the account to `active` | Test |
| B9 | `POST /auth/signup/resend`: new code, old code invalidated | Test |
| B10 | Age check: `AgeVerifier` interface, declared birth date, `age_verifications` row | Test |

### Login and session
| # | Task | Done when |
|---|---|---|
| B11 | `POST /auth/login`: e-mail and password, constant-time comparison even for unknown accounts, unverified accounts refused | Test |
| B12 | Failed-login counters in the database: 5 failures lock for 15 minutes; success resets | Test |
| B13 | Each attempt written to `login_events` (IP hashed with `IP_HASH_KEY`, user agent) | Test |
| B14 | Session ID regenerated at login (section 13) | Test |
| B15 | `POST /auth/logout`: destroys the session | Test |

### Password reset and e-mail change
| # | Task | Done when |
|---|---|---|
| B16 | `POST /auth/password-reset/request`: same answer whether the account exists; code sent only if it does | Test |
| B17 | `POST /auth/password-reset/confirm`: code, new password, code consumed, all sessions of the user closed, "password changed" e-mail (R18) | Test |
| B18 | `POST /auth/email-change/request` (active, logged-in user): code sent to the new address | Test |
| B19 | `POST /auth/email-change/confirm`: updates `users.email`, "e-mail changed" sent to the old address (R18) | Test |

### Rate limits and scheduled jobs
| # | Task | Done when |
|---|---|---|
| B20 | Limits of section 9.4 on each security endpoint, 429 with `Retry-After` | Test |
| B21 | Re-add `@nestjs/schedule`: daily purge of codes expired for more than 24 hours, and of expired sessions (DEC-068) | Test |

### E-mail
| # | Task | Done when |
|---|---|---|
| B22 | Brevo adapter over HTTP, `BREVO_API_KEY` and `MAIL_FROM_ADDRESS` checked only when this adapter is selected | Test with a fake HTTP |
| B23 | French e-mail texts: codes, password changed, e-mail changed. No code in logs | Test |

### Contract, configuration, cleanup
| # | Task | Done when |
|---|---|---|
| B24 | `openapi.yaml` regenerated, `npm run openapi:check` passes | Check passes |
| B25 | New configuration keys in validation, `.env.example` and section 15.2 | Test |
| B26 | Unit tests of every service | Tests pass |
| B27 | Integration tests on PostgreSQL (Supertest + Testcontainers): full signup, same answer for existing e-mail, five wrong codes, resend, login, lock, `login_events`, logout, reset, e-mail change, 429 | Tests pass |

## Frontend (M1-F)

| # | Task | Done when |
|---|---|---|
| F1 | Read the `Auth-*` boards (login, signup, errors, code, forgot password, welcome, session expired) for desktop, tablet and mobile | Read and listed |
| F2 | Components needed (text field, button, checkbox) in CSS Modules with the variables | Components exist |
| F3 | API client: `X-CSRF-Token` read from the `y_csrf` cookie, Problem Details turned into French messages | Unit tests |
| F4 | Signup page, with client validation that mirrors the server rules | Unit tests |
| F5 | Code page, with resend | Unit tests |
| F6 | Login page (label "Adresse e-mail") | Unit tests |
| F7 | Forgot-password page: request, code, new password | Unit tests |
| F8 | Session route so the frontend knows whether the user is logged in | Test |
| F9 | Protected pages redirect to login | Test |
| F10 | Error messages in French, text as well as colour, focus managed | Tests |
| F11 | Vitest tests of forms and validation rules | Tests pass |
| F12 | Playwright tests (mocked API): signup, login, forgot password, lock, on three viewports | Tests pass |
| F13 | axe checks on every auth screen | No violation |

## Documentation and exit (M1-X)

| # | Task | Done when |
|---|---|---|
| X1 | Journal entries for each decision of the build | Done |
| X2 | Product doc: section 9.2 statuses, section 13 (CSRF name, DEC-138), section 15.2 (new keys) | Done |
| X3 | This plan updated after each step | Done |
| X4 | Exit: end-to-end signup and login tests green, rate limits active and tested | Checked |

## Progress

Status on 2026-10-19, after the merge of `m1-login` into `main` (fast-forward to `d86e0a5`, pushed). Checked against the code and the test runs: 131 backend unit tests, 83 backend e2e, 99 frontend unit tests, 72 frontend e2e (9 of them against the real backend).

| Step | Status | Commit |
|---|---|---|
| Decisions DEC-136 to DEC-146 | Done (journal entries for the build decisions, see X1) | c13466f |
| B1 to B6 foundations: argon2id, codes, users repository, input rules, errors | Done | db199fa |
| B7 to B10 signup: create, verify, resend, age check | Done (DEC-142 applied, then superseded for the age order: see X1) | b105cd1 |
| B11 login and session (lock rule DEC-143, session ID regenerated, logout) | Done | 863979f |
| B14 session ID regenerated at login | Done (`regenerate` before the user is stored) | 863979f |
| B15 logout destroys the session | Done (route in openapi.yaml) | 863979f |
| B16 to B19 password reset and e-mail change (409 when the address is taken) | Done | 863979f |
| B20 rate limits of section 9.4 on each security endpoint (login 20 per 15 minutes; signup 5 per hour; code requests 10 per hour; code checks 20 per hour; 429 with `Retry-After`) | Done: decorator on the nine security routes, tested over HTTP and in the application (`auth-rate-limit.e2e-spec.ts`). Behind a proxy the client address needs `TRUST_PROXY_HOPS` (see B25) | uncommitted |
| B21 purge job (codes expired for 24 hours, expired sessions) | Done: `PurgeModule` imported in `AuthModule`; the daily job is registered when the application starts (`purge-schedule.e2e-spec.ts`) | uncommitted |
| B21 maintenance role may delete the purged tables | Done: `backend/database/roles.sql` grants DELETE on the four tables; checked with the maintenance role itself, not the superuser (`database-roles.e2e-spec.ts`) | uncommitted |
| B22 Brevo sender, fails closed without `BREVO_API_KEY` or `MAIL_FROM_ADDRESS` | Partly: wired in production, not called against Brevo (no account yet, DEC-110) | 863979f |
| B23 French e-mail texts, no code in logs | Done, tests written: the five account e-mails are French and carry the code and its validity (`mail-texts.spec.ts`); log redaction of `code` and `password` (`logging.options.spec.ts`); no account service or mail module calls a logger (`no-code-in-logs.spec.ts`, the purge job logs counts only). Flow-level log capture is not tested | uncommitted |
| B24 `openapi.yaml` regenerated, check passes | Done (`openapi:check` OK) | 863979f |
| B25 configuration keys in validation, `.env.example`, section 15.2 | Done: all keys are validated at startup, including `TRUST_PROXY_HOPS` (default 0) and, in production only, `BREVO_API_KEY` and `MAIL_FROM_ADDRESS` (a valid e-mail address). Checked: production without the key refuses to start, and names the key only | uncommitted |
| B26 unit tests of every service | Done: every auth service and guard has a unit spec (checked by listing the files). Repositories and the session store are covered by the PostgreSQL integration tests instead | 863979f |
| B27 integration tests on PostgreSQL (signup, lock, reset, e-mail change, purge) | Done: each case of the B27 list has an e2e test (`signup`, `login`, `password-reset`, `email-change`, `auth-rate-limit`, `purge`, `database-roles`) | 863979f |
| F1 read the `Auth-*` boards | Done | — |
| F2 to F13 frontend: components, API client, signup, code, login, forgot password, session route, protected area, French messages, Vitest, Playwright, axe | Done (axe on the four auth screens, Playwright on three viewports) | d86e0a5 |
| X1 journal entries for each decision of the build | Done: DEC-147 to DEC-157 added (login duplicate, redirect, CSRF fetch, SESSION cookie, Suspense, age order, rate limits, proxy hops, purge rights, Brevo keys, no code in logs); DEC-142 marked as partly replaced by DEC-152 | uncommitted |
| X2 product doc: sections 9.2, 13, 15.2 | Done: CSRF cookie name corrected in section 13 (`y_csrf`, not `XSRF-TOKEN`); `GET /auth/session` added to 9.2; `SESSION` cookie named, `Secure` outside local; section 15.2 lists the new keys | uncommitted |
| X3 this plan updated after each step | Done (this update) | — |
| X4 exit: e2e signup and login green, rate limits active and tested | **Partly met**: e2e green (backend 89, frontend 72) and rate limits active and tested; M1 is not closed until B23, the Brevo keys (B25) and X1 and X2 are done | — |

## Gaps to close before M1 is complete

1. Done: rate-limit decorator on the security endpoints (B20), tested with a 429 and `Retry-After`.
2. Done: `PurgeModule` imported, and the registration of the daily job tested (B21).
3. Done: maintenance role granted DELETE on `signup_codes`, `password_reset_codes`, `email_change_codes` and `sessions`, tested without the superuser (B21).
4. Add `BREVO_API_KEY` and `MAIL_FROM_ADDRESS` to the environment validation (B25).
5. French e-mail texts and the "no code in logs" test (B23).
6. Done: journal entries for the integration decisions, and the product doc sections 9.2, 13 and 15.2 checked (X1, X2).
