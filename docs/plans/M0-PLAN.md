# M0 — Foundations: step-by-step plan

| | |
|---|---|
| **Milestone** | M0 — Foundations (product doc, section 18) |
| **Goal** | Monorepo, NestJS and Next.js skeletons pinned to the versions in section 5, Docker Compose PostgreSQL, CI, initial Prisma migration from the DBML, test tooling, staging environment, backup job and rollback plan (forward-only migrations) |
| **Exit criteria** | `docker compose up` starts everything. CI is green on a pull request. A backup restores on staging. |
| **Notion tasks** | Sprint 1 — M0 Foundations, project M0 (see the Notion workspace, if still in use) |
| **Decisions applied** | DEC-043 (API conventions), DEC-069 (NestJS), DEC-070 (PostgreSQL), DEC-071 (sessions table), DEC-072 (Prisma), DEC-073 (test tooling), DEC-074 (backend libraries), DEC-056 (staging, backups, rollback). DEC-055 is replaced by DEC-069 and DEC-070. |

---

## 0. Before any code (you)

These need your decision or your account. Nothing below can start until they're done.

| # | Step | Why | Done when |
|---|---|---|---|
| 0.1 | **Approve creating the GitHub repository** | GitHub is an external service. The working rule is to ask first. CI (step 9) depends on it. | You say yes, and give the repository name. |
| 0.2 | **Choose the repository folder name** | The product doc said `design/`, but the folder was named `claude-design-assets/` and an empty `designs/` existed. | **Decided: `design/`.** The old name was replaced everywhere, and the empty `designs/` folder was removed. |
| 0.3 | **Create the OVH server** (5 to 10 euros a month, France) | Needed for staging (step 10) and backups (step 11). | Server is created. You send me the SSH access method. |
| 0.4 | **Create the Brevo account** (free plan) | Needed later for e-mail. The API and SDK are included, per DEC-018. Not needed for M0 code, but needed before M1. | Account created. API key kept out of Git. |
| 0.5 | **Age check provider** | No external provider: the birth date declared at signup decides (DEC-216). | Decision recorded. |
| 0.6 | **Confirm the "Pour vous" trending rule** | Needed in M2, not M0. Tracked in D17. | Done: confirmed by the owner, "most reactions in the last 24 hours" (DEC-046). |

---

## 1. Repository layout (you, then Claude)

| # | Task | Output | Done when |
|---|---|---|---|
| 1.1 | Create the monorepo folders, per product doc section 6 | `backend/`, `frontend/`, `docs/` (exists), the design folder chosen in 0.2, `docker-compose.yml`, `.github/workflows/` | Folders exist. Nothing is committed yet. |
| 1.2 | Initialise Git with trunk-based rules | `.gitignore` (Node, `.env`, IDE files, `node_modules/`, `dist/`, `.next/`), a `README.md` at the root | `git status` is clean. Branch `main` exists. |
| 1.3 | Write the contribution rules | Branch names `feat/`, `fix/`, `chore/`, `docs/`. Conventional Commits (section 17). One reviewer before merge. | Rules are written in `README.md`. |

**Commits:** only when you ask me to commit (repository rule).

---

## 2. Local infrastructure (Claude)

| # | Task | Output | Done when |
|---|---|---|---|
| 2.1 | Write `docker-compose.yml` with a PostgreSQL 18 service | PostgreSQL service, a named volume, a health check (`pg_isready`), port 5434 on localhost only (DEC-125; 5432 and 5433 are used by system PostgreSQL on the development machine) | `docker compose up -d postgres` starts and reports healthy. |
| 2.2 | Create `.env.example` (no secrets) | Variables from section 15.2: `DATABASE_URL`, `DATABASE_MAINTENANCE_URL`, `Y_CONVERSATION_THRESHOLD=50`, `Y_CODE_TTL_MINUTES=15`, and placeholders (no values) for `IP_HASH_KEY`, `AUDIT_HMAC_KEY` and `BREVO_API_KEY` | Example file exists. Real `.env` is ignored by Git. |
| 2.3 | Confirm the PostgreSQL version at scaffold | Patch version of 18.x, recorded in the product doc section 5 and the journal (DEC-070) | Version recorded. Done 2026-10-19: 18.6, pinned by digest (DEC-126). |

---

## 3. Backend skeleton (Claude)

| # | Task | Output | Done when |
|---|---|---|---|
| 3.1 | Generate the NestJS project | Node.js 24 LTS, NestJS **11.x** (latest patch at scaffold), TypeScript in strict mode, npm with `package-lock.json`, folder `backend/` | `npm run build` and `npm test` pass on an empty application. |
| 3.2 | Add the libraries | `@nestjs/config`, `@nestjs/swagger` (enabled locally and in staging only), `class-validator`, `class-transformer`, Prisma 7 (`prisma`, `@prisma/client` and the PostgreSQL adapter the pinned version requires), `express-session`, `argon2`, `helmet`, `@nestjs/throttler`, `@nestjs/schedule`, `@nestjs/terminus`, `nestjs-pino` (DEC-074) | Application starts with the database. Unused libraries were removed on 2026-10-19 by owner order and return with their step: `@prisma/client` and the adapter with this step's database check, `express-session` with 3.9, `argon2` with the auth module, `@nestjs/schedule` with the first scheduled job. Done 2026-10-19: `@prisma/client` and `@prisma/adapter-pg` 7.10.1 back. `/health` runs `SELECT 1` on the database (503 with the Terminus body when it is down). Tests: `app.e2e-spec.ts`, `health-database.e2e-spec.ts`. |
| 3.3 | Create the feature modules (section 8.1) | Each feature module (`*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.module.ts`, `dto/`) is created with the step that needs it. Empty placeholders were removed on 2026-10-19 by owner order. `src/common/` exists now (CSRF, logging, Problem Details, audit chain). | Each module exists when its step starts. |
| 3.4 | Configuration with `@nestjs/config` | Profiles `local`, `staging`, `production` selected by `NODE_ENV`. Configuration keys from section 15.2. The threshold is read from configuration, never hard-coded (section 8.3). | Each profile loads. Missing secrets, including `IP_HASH_KEY` and `AUDIT_HMAC_KEY`, fail at startup. |
| 3.5 | Expose the health endpoint | `/health` through @nestjs/terminus, outside the `/api/v1` prefix (section 7). In production, Swagger is off (section 9). | `curl localhost:8080/health` returns `status: ok`. |
| 3.6 | Set the API base path | Global prefix `/api/v1` (section 9.1) | A test endpoint responds under `/api/v1`. |
| 3.7 | Error format | RFC 9457 Problem Details, `application/problem+json`, from one global exception filter, status codes as in section 8.4 | A test error returns the Problem Details shape. |
| 3.8 | Structured logs with a request ID | JSON logs with `nestjs-pino`, request ID on every line. No passwords, codes, session IDs or full e-mail addresses (section 8.3). | A log line contains the request ID and no secret. |
| 3.9 | Session store | express-session with an application store on the `sessions` table (DEC-071). Cookie HTTP-only, Secure, SameSite=Lax. Sliding 30-day expiry. | A test login creates one row, and a logout deletes it. Done 2026-10-19: `SessionStore` on the `sessions` table, `express-session` 1.19.0, cookie `SESSION`. Test: `sessions.e2e-spec.ts`. |
| 3.10 | Security basics | Helmet headers, CORS limited to `APP_PUBLIC_URL`, CSRF double-submit token on mutations, global `ValidationPipe` with `whitelist` (section 13) | A request without the CSRF token is refused. An unknown field in a body is refused. |

---

## 4. Database (Claude)

| # | Task | Output | Done when |
|---|---|---|---|
| 4.1 | Write the initial migration from the DBML | `backend/prisma/schema.prisma` (datasource `postgresql`) and `backend/prisma/migrations/<timestamp>_init/migration.sql`. Contents: the 24 tables of `docs/database/y-database.dbml` (version 0.6), the enum types, the indexes, the `sessions` table (DEC-071), `uuid` columns with `gen_random_uuid()`, `timestamptz(3)` times. | `prisma migrate deploy` applies it to an empty PostgreSQL without errors. |
| 4.2 | Add the constraints the DBML cannot express | `CHECK`: `follows` and `blocks` (no self-reference), `reports` (exactly one target), `reports.details` required for `other`, counters `>= 0`, `users.handle` matches `^[A-Za-z0-9_]+$`. Unique index on `lower(handle)` (DEC-061, DEC-070). GIN indexes on `to_tsvector` of `questions.body`, `users.handle` and `users.display_name`. | Constraints and indexes exist, checked by a test query. |
| 4.3 | Check the migration against the reference | Column by column with `docs/database/y-database-documentation.md` | Review note saved. No mismatch. |
| 4.4 | Integration test on a fresh PostgreSQL | Testcontainers runs the migrations on PostgreSQL 18 (section 10.1, step 4) | Test passes. |
| 4.5 | Write the rule for migrations | Never edit an applied migration. Forward-only. A rollback is a new corrective migration (DEC-056). | Rule written in `README.md` and the product doc section 10. |
| 4.6 | Test the audit chain against the reference example | A unit test builds the two entries of the reference (`admin_audit_log`, hash chain section) with the sample key and checks both HMACs (DEC-064, DEC-128). The verification reads entries ordered by `created_at`, then `id` (DEC-127). A second test alters the first entry and checks that verification fails. Insertions take a transaction-level advisory lock (`pg_advisory_xact_lock`), so the chain stays in order (DEC-063). | Both tests pass. |
| 4.7 | Set the database roles | A SQL script, run once per environment outside Prisma Migrate. The application role has `SELECT` and `INSERT` on `admin_audit_log` and `login_events`, and no `UPDATE` or `DELETE`. The maintenance role has `DELETE` on those two tables only (DEC-059, DEC-065, DEC-129). Script: `backend/database/roles.sql`. Test: `backend/test/database-roles.e2e-spec.ts`. | An integration test shows that the application role is refused `UPDATE` and `DELETE` on `admin_audit_log` (`permission denied`). |

---

## 5. Seed data (Claude)

| # | Task | Output | Done when |
|---|---|---|---|
| 5.1 | Seed script for local and staging | Prisma seed script (`prisma db seed`): a few fictional users, questions, replies, hashtags. No real personal data (section 15.1). | Seed runs on a fresh database. Done 2026-10-19: `src/database/seed.ts`, run with `npm run db:seed`. Test: `seed.e2e-spec.ts`. |

---

## 6. Frontend skeleton (Claude)

| # | Task | Output | Done when |
|---|---|---|---|
| 6.1 | Generate the Next.js project | Next.js **16.2.11 or later** (pin the latest patch at scaffold), App Router, TypeScript strict, Node.js 24 LTS | `npm run build` passes on an empty app. |
| 6.2 | Folder structure (section 6) | `app/`, `components/`, `lib/` (API client), `styles/` (design tokens) | Folders exist. |
| 6.3 | Lint and format | ESLint, Prettier, TypeScript strict | `npm run lint` passes. |
| 6.4 | Design tokens | `styles/tokens.css` generated from `design-system/ds-build/project/tokens.json` (root of the project, shared across sites, DEC-075) (light theme only, AA colours from step 5). CSS Modules with CSS variables (D10). | A test page uses `--color-primary` (`#4f46e5`). |
| 6.5 | Health and error boundary | A page that calls `/health` through the API client, and a global error page | Page renders, and the error page shows on a forced error. Verified 2026-10-19: in a production build, a temporary route that throws (removed afterwards) shows the French error page in Chromium with a retry button, and does not show the technical message. |

---

## 7. Test tooling (Claude)

| # | Task | Output | Done when |
|---|---|---|---|
| 7.1 | Backend tests | Jest for unit tests, Supertest for HTTP tests, Testcontainers for Node with the PostgreSQL module (DEC-073). `npm test` and `npm run test:e2e` run them. | One sample test per layer passes. |
| 7.2 | Frontend tests | Vitest, Testing Library. One sample component test. | `npm test` passes. Done 2026-10-19: Vitest 5.0.5 with Testing Library (React 16.3.3, DOM 10.4.2, jest-dom 7.0.1) and jsdom 30.1.3. Test: `frontend/components/health-status.test.tsx` (three states). `npm test` passes. |
| 7.3 | End-to-end | Playwright on the three breakpoints (desktop, tablet, mobile). One smoke test (home page loads). | Smoke test passes on all three sizes. Done 2026-10-19: Playwright 1.64.1 (`@playwright/test`), Chromium only, three viewports (desktop 1440, tablet 768, mobile Pixel 7). Tests: `frontend/e2e/home.spec.ts` (title and API status, no horizontal scroll). 6 of 6 pass. |
| 7.4 | Accessibility | axe in the Playwright smoke test | axe reports no violation on the home page. Done 2026-10-19: `@axe-core/playwright` 4.14.0 with the WCAG 2.2 AA tags, in the Playwright smoke test on three viewports. The test also checks that axe ran rules. Test: `frontend/e2e/accessibility.spec.ts`. |
| 7.5 | E-mail capture | A test mail adapter that records messages instead of sending them (DEC-073). Brevo is never called in tests. | A test sends a message through the adapter and reads it back. No real e-mail is sent. Done 2026-10-19: `MailSender` contract and `CapturingMailSender` (test adapter, refuses production). Brevo not wired (DEC-110). Test: `capturing-mail-sender.spec.ts`. |
| 7.6 | API contract | `openapi-diff` (open source) in CI, comparing `openapi.yaml` with the last committed version | The check runs on a changed API. Done 2026-10-19: `npm run openapi:export` writes `backend/openapi.yaml` (committed); `npm run openapi:check` runs `openapi-diff` against it and fails on a breaking change or a stale file. Test: `openapi.e2e-spec.ts`. CI run with step 9. |
| 7.7 | Security scans | OWASP Dependency-Check (dependencies), Semgrep (code). OWASP ZAP is for staging later. | Both run locally without errors. Done 2026-10-19: Semgrep 1.179.0 (0 findings) and Dependency-Check 12.2.2 (780 dependencies; one HIGH finding in a test-only dependency, excepted with DEC-133). `npm run security:code` and `npm run security:dependencies`; images pinned by digest. |

---

## 8. Git hygiene (Claude, then you)

| # | Task | Output | Done when |
|---|---|---|---|
| 8.1 | First commit, only when you ask | Commit message in Conventional Commits, for example `chore: scaffold monorepo` | Commit exists on `main`. |
| 8.2 | Branch protection (needs step 0.1) | `main` requires a pull request and one approving review | Setting is visible on GitHub. |

---

## 9. Continuous integration (Claude, after 0.1)

| # | Task | Output | Done when |
|---|---|---|---|
| 9.1 | Workflow on every pull request | GitHub Actions: backend `npm run lint && npm test && npm run test:e2e`, frontend `npm run lint && npm test && npm run build`, `openapi-diff` | A pull request shows green checks. |
| 9.2 | Security scans in CI | Dependency-Check and Semgrep (step 7.7) | Scans run. High-severity findings fail the build (DEC-054). |
| 9.3 | Smoke end-to-end in CI | Playwright smoke test (step 7.3) | Runs green. |

---

## 10. Staging environment (Claude, after 0.3)

| # | Task | Output | Done when |
|---|---|---|---|
| 10.1 | Staging profile on the OVH server | Docker Compose on the server: PostgreSQL 18, backend image (Node.js 24), frontend. Swagger on. Seed data only (step 5.1). | Staging answers on `/health`. |
| 10.2 | Server hardening | HTTPS, firewall (only 22, 80, 443), SSH keys only, updates | Checked by you and by a port scan. |
| 10.3 | Staging secrets | Stored on the server only, never in Git | `.env` on the server only. |

---

## 11. Backups (Claude, after 10.1)

| # | Task | Output | Done when |
|---|---|---|---|
| 11.1 | Daily PostgreSQL dump | Cron job runs `pg_dump -Fc` each night | A dump file appears each day. |
| 11.2 | Encryption | Dump encrypted before storage (openssl, key on the server, not in Git) | Encrypted file cannot be read without the key. |
| 11.3 | Storage in the EU | OVH storage in France. Cost accepted (DEC-044). | File is stored in France. |
| 11.4 | Retention 14 days | Older dumps deleted automatically (product doc section 13, DEC-027) | Only 14 dumps remain. |

---

## 12. Restore test (Claude, after 11.1)

| # | Task | Output | Done when |
|---|---|---|---|
| 12.1 | Restore the latest dump on a separate copy | A copy of the database on staging with the seed data only, restored with `pg_restore` | Restore completes. Row counts match the dump. |
| 12.2 | Write the result | Restore procedure and result in `docs/operations.md` | Procedure documented. This is the M0 exit check. |

---

## 13. Rollback plan (Claude)

| # | Task | Output | Done when |
|---|---|---|---|
| 13.1 | Write the rollback procedure | `docs/operations.md`: keep the previous container image; a database backup before each deploy; a broken migration is fixed by a new corrective migration, never by editing an applied one (DEC-056) | Procedure written and reviewed. Done 2026-10-19: `docs/operations.md` written (target procedure; the review is the owner's). |

---

## 14. Documentation and records (Claude)

| # | Task | Output | Done when |
|---|---|---|---|
| 14.1 | Pinned versions | Exact patch versions recorded in the product doc section 5 and in the journal (DEC-069, DEC-070, DEC-072) | Versions recorded. Done 2026-10-19: exact versions in the product doc section 5 and in DEC-134. |
| 14.2 | Repository README | How to start each service, how to run tests, the migration rule | README reads well to a new developer. Done 2026-10-19: root README has a getting-started guide (services, tests, checks, roles) and the migration rule. |
| 14.3 | Index | `docs/README.md` lists the new files | Index updated. Done 2026-10-19: the index lists the schema review, the API contract, the operations procedure and the journal. |
| 14.4 | Status | Notion task statuses and the "Build progress" notes updated after each phase, if the workspace is still used | Statuses match the work. Not applicable: Notion is not used for this plan. |

---

## 15. Exit check (you and Claude)

| # | Check | Done when |
|---|---|---|
| 15.1 | `docker compose up` starts PostgreSQL, backend and frontend | All three healthy |
| 15.2 | CI is green on a pull request | Green checks visible |
| 15.3 | A backup restores on staging | Restore result written (step 12.2) |
| 15.4 | Health endpoint returns `ok` on local and staging | Both respond |

When every check is done, M0 is complete. Next milestone: **M1 — Accounts**, with the age check from the declared birth date (DEC-216).

---

## Order at a glance

1. **You:** 0.1 to 0.6 (GitHub, folder name, OVH, Brevo, age check provider (DEC-216), trending rule)
2. **Repository:** 1.1 to 1.3, then 2.1 to 2.3
3. **Backend:** 3.1 to 3.10
4. **Database:** 4.1 to 4.7, then 5.1
5. **Frontend:** 6.1 to 6.5
6. **Tests:** 7.1 to 7.7
7. **Git:** 8.1 (on request), 8.2 (after 0.1)
8. **CI:** 9.1 to 9.3 (after 0.1)
9. **Staging:** 10.1 to 10.3 (after 0.3)
10. **Backups and restore:** 11.1 to 11.4, then 12.1 to 12.2
11. **Rollback:** 13.1
12. **Records:** 14.1 to 14.4
13. **Exit check:** 15.1 to 15.4
