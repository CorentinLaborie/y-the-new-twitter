# Schema review — 2026-10-19 (M0 step 4.3)

**Scope:** migration `backend/prisma/migrations/20261019131618_init/migration.sql` checked against the database reference `docs/database/y-database-documentation.md` (version 0.9), table by table and column by column.

**Method:** a one-off script (kept outside the repository) read each table's **Columns** block in the reference and each `CREATE TABLE` in the migration, then compared:

- the set of tables and the set of columns,
- the SQL type (for example `varchar(30)`, `timestamptz(3)`, `uuid`, enum names),
- nullability (`Required` in the reference against `NOT NULL` in SQL),
- presence of a default (where the reference has a Default column).

## Result

| Check | Result |
|---|---|
| Tables in the reference and in the migration | 28 and 28, same names |
| Columns present in both | all, no extra or missing column |
| SQL type | no mismatch |
| Nullability | no mismatch |
| Default present or absent | no mismatch on the tables that have a Default column |

No mismatch found.

## Points noted, not changed

1. **`sessions`**: the reference table has no Default column (its columns are Column, Type, Required, Key, Description). Nothing to compare. The column types and nullability match.
2. **`admin_audit_log.prev_hash`**: the reference gives the default as "`64` zeros for the first entry". The migration has no `DEFAULT`, and that is intended: the application writes the first entry with 64 zeros (DEC-063). Not a mismatch. The reference could say "set by the application" to avoid confusion.

## Not covered by this review

- Indexes, unique constraints, CHECK constraints and foreign-key rules: they come from `20261019131646_constraints` and `20261019140000_owner_decisions`, and from the owner decisions DEC-119 to DEC-124. They are not checked here.
- The migrations are **not applied to any database yet**. Applying them and running the integration test is step 4.4.
- The audit-chain test vector is step 4.6.
