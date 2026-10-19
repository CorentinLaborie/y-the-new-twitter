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

## Contribution rules

- The branch `main` is the trunk. Work happens on short-lived branches.
- Branch names use one prefix: `feat/`, `fix/`, `chore/` or `docs/`, followed by a short description, for example `feat/question-form`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), for example `chore: scaffold monorepo`.
- Every change reaches `main` through a pull request with one approving review.
- Commits are made only when the owner asks for them.

## Database migrations

- Migrations live in `backend/prisma/migrations/`. Never edit a migration that has been applied on any environment; fix a mistake with a new migration.
- Migrations are forward-only. A rollback is a new corrective migration that reverses the change (DEC-056), never an edited or deleted folder.
- Workflow and details: [product doc, section 10](docs/y-product-and-web-documentation.md#10-database).
