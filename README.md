# Y — The new Twitter

Monorepo for the Y social application: a NestJS backend, a Next.js frontend, the product and database documentation, and the design sources.

## Layout

| Folder | Content |
|---|---|
| `backend/` | NestJS 11 API on Node.js 24 LTS, TypeScript strict, Prisma 7 on PostgreSQL 18 |
| `frontend/` | Next.js App Router, TypeScript strict |
| `docs/` | Product and web documentation, database schema (DBML and reference), decision journal, M0 plan, legal texts |
| `design/` | Design sources: canvas build, briefs and the layout script (the `archive/` folder is not versioned) |
| `.github/workflows/` | Continuous integration (set up in M0, step 9) |

Start with [`docs/README.md`](docs/README.md) for the index of the documentation.

## Getting started

Requirements: Node.js 24 LTS, npm, and Docker with the Compose plugin. The frontend is not set up yet.

### Database

```bash
docker compose up -d postgres        # PostgreSQL 18.6 on 127.0.0.1:5434
```

### Backend (port 8080)

```bash
cp .env.example backend/.env         # fill every secret locally, with openssl rand -hex 32; never commit .env
cd backend
npm install
set -a; . ./.env; set +a             # the Prisma CLI reads DATABASE_URL from the environment
npx prisma migrate deploy            # applies the migrations
npm run db:seed                      # optional: fictional data for local development
npm run build && npm start           # then: curl localhost:8080/health
```

The backend refuses to start when a required secret is missing, and prints only the name of the key.

### Tests and checks

```bash
cd backend
npm run lint && npm test             # unit tests (no Docker needed)
npm run test:e2e                     # end-to-end and migration tests: Docker must run
npm run openapi:check                # the API contract matches backend/openapi.yaml
npm run security:code                # Semgrep, through Docker
npm run security:dependencies        # Dependency-Check, through Docker; set NVD_API_KEY in the environment (optional, slow without it)
```

The contract is changed on purpose: `npm run openapi:export`, then commit `backend/openapi.yaml` with the API change.

### Database roles

Once per environment, after the migrations, as the database owner. See `docs/y-product-and-web-documentation.md`, section 10.3.

```bash
psql -U <owner> -d <db> -v db=<db> -v app_password=… -v maintenance_password=… -v backup_password=… -f backend/database/roles.sql
```

Further reading: [docs index](docs/README.md), [rollback procedure](docs/operations.md), [product doc](docs/y-product-and-web-documentation.md).

## Contribution rules

- The branch `main` is the trunk. Work happens on short-lived branches.
- Branch names use one prefix: `feat/`, `fix/`, `chore/` or `docs/`, followed by a short description, for example `feat/question-form`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), for example `chore: scaffold monorepo`.
- Every change reaches `main` through a pull request with one approving review.
- Commits are made only when the owner asks for them.

## Database migrations

- Migrations live in `backend/prisma/migrations/`. Never edit a migration that has been applied on any environment; fix a mistake with a new migration.
- Migrations are forward-only. A rollback is a new corrective migration that reverses the change (DEC-056), never an edited or deleted folder.
- A table purged by a maintenance job gets its `y_maintenance` grant in its own migration, as a `DO` block that grants only when the role exists (`pg_roles`). Nobody grants it by hand (product doc, section 10.2).
- Once per fresh environment, after the migrations, as the database owner: `psql -U <owner> -d <db> -v db=<db> -v app_password=… -v maintenance_password=… -v backup_password=… -f backend/database/roles.sql`. The script only creates the roles (product doc, section 10.3).
- Workflow and details: [product doc, section 10](docs/y-product-and-web-documentation.md#10-database).
