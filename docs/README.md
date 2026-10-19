# Y — Documentation

Index of the project documentation.

| Document | Audience | What it covers |
|---|---|---|
| [Product and web documentation](y-product-and-web-documentation.md) | Whole team | Product rules, features, architecture, stack, API, frontend and backend conventions, security, testing, roadmap, open decisions, glossary |
| [Stack overview (French)](stack-expliquee-simplement.md) | Anyone new to the project | The technologies explained in plain language, with a restaurant analogy |
| [Database schema](database/y-database.dbml) | Backend and database developers | Schema source of truth (version 0.9, PostgreSQL), in DBML. Open it with any DBML viewer, such as dbdiagram.io |
| [Database column reference](database/y-database-documentation.md) | Backend and database developers | Every table and column, its type, keys, defaults and meaning |
| [Decision journal](decisions/journal-decisions.md) | Whole team | Every decision (DEC-001 onward): status, reason, alternatives, when to revisit |
| [M0 plan](plans/M0-PLAN.md) | Whoever builds the foundations | Step-by-step plan for M0, sorted by area and order |
| [Legal drafts](legal/README.md) | Whoever publishes the site | Legal notice, terms of use and privacy policy. Drafts for a fictitious portfolio site |
| [Audit snapshot (2026-10-16)](reports/RAPPORT-AUDIT-Y.md) | Reviewers | The audit made before the decisions. Superseded where the decision journal says otherwise |

The design source is in [`../design/`](../design/STATUS.md). The design system, shared across sites, is in [`../../design-system/`](../../design-system/).

## Where to start

- New to the project: read the stack overview, then the product section of the product and web documentation.
- Building a feature: read the product rules (section 2), then the feature's API and data sections.
- Changing the database: read the migration workflow in section 10 of the product and web documentation first.
- Looking for a past decision: search the decision journal.

## Status

The product document is at version 0.10 and the schema at version 0.9 (October 2026). The stack is NestJS (TypeScript) on PostgreSQL (DEC-069, DEC-070). The design is in `y/design/` (the design system is in `design-system/`, shared across sites). Decisions D1 to D13 and the later decisions are recorded in the decision journal. Open points are listed in the product doc (section 19) and in the M0 plan. Items marked **TO CONFIRM** are still open.
