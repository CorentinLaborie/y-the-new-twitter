# Y — Operations: rollback procedure

> **Status (2026-10-19):** target procedure. Staging, the container image, the CI pipeline and the backup job come with M0 steps 9 to 11. Until then, nothing here is run in production, and the commands are checked against the local database only. The restore test (step 12) is the M0 exit check and fills in section 4.

## 1. Principles

- **Forward-only migrations.** An applied migration is never edited or deleted. A broken migration is fixed by a new, corrective migration (DEC-056, product doc section 10.2).
- **The previous version stays available.** Every deploy keeps the previous container image, under its version tag, so that the application can be started again without a rebuild.
- **A backup before every deploy.** The database is dumped just before a migration runs. The dump is the way back if a migration damages data.
- **Health first.** After any deploy or rollback, `GET /health` must return `200` with `"status": "ok"` before the change is considered done (section 7 of the product doc).

## 2. Before each deploy

1. Confirm the pipeline is green (lint, tests, end-to-end tests, `openapi:check`, security scans).
2. Dump the database (step 11.1, `pg_dump -Fc`, encrypted before storage, kept 14 days):
   ```bash
   pg_dump -Fc --no-owner -d "$DATABASE_URL" -f "backup-$(date -u +%Y%m%dT%H%M%SZ).dump"
   ```
3. Note the image tag currently running. It is the rollback target.
4. Run the migrations as a separate step, before the new version starts (product doc section 16):
   ```bash
   npx prisma migrate deploy
   ```

## 3. Rolling back the application (no database change)

Use this when the new version misbehaves, and the migrations it brought are compatible with the old version.

1. Start the previous image tag noted in step 2.3.
2. Check `GET /health` (200, `status: ok`) and one authenticated request.
3. Keep the failed image, with its logs, for the review.

The database is left as it is. The old version must work with the migrated schema. That is why every migration must be backward-compatible with the version before it: add columns and tables first, and remove them only in a later release.

## 4. Rolling back a bad migration

A migration that broke data, or that the old version cannot run with, is **never** reverted by editing it or by deleting its folder.

1. Stop the deploy. Do not start the new version against the broken schema.
2. Write a new, corrective migration (`npx prisma migrate dev --name <what-it-fixes>` on a local copy, then review the SQL). It reverses or repairs the change; it does not rewrite history.
3. Test it on a copy: restore the latest dump on a separate database (step 12.1), then run `npx prisma migrate deploy` against that copy. Row counts must match the dump before the migration, except for the rows the fix changes.
4. Deploy the corrective migration with the same steps as section 2.
5. If data was lost or damaged and the corrective migration cannot recover it, restore the pre-deploy dump (section 5).

## 5. Restoring the database from a dump

The backups are written by ops/backup/backup.sh (encrypted with openssl, 14 days kept). The restore check is ops/backup/restore.sh, which decrypts a dump into a scratch database and compares row counts with the source.

The restore always goes to a **new** database. The damaged database is kept until the restore is checked, then removed by a person, not by a script.

```bash
createdb -h "$DB_HOST" -U "$DB_OWNER" y_restore
pg_restore --no-owner -d "postgresql://$DB_OWNER@$DB_HOST/y_restore" backup-<timestamp>.dump
```

Then:

1. Compare row counts of the main tables with the dump's log (`pg_restore -l`).
2. Run `npx prisma migrate status` against `y_restore`: it must report the migrations applied up to the dump.
3. Recreate the database roles with `backend/database/roles.sql` (product doc section 10.3): the roles belong to the cluster, and a new database needs its grants.
4. Point `DATABASE_URL` and `DATABASE_MAINTENANCE_URL` to `y_restore`, restart the backend, and check `GET /health`.

Restoring loses the data written after the dump. The decision to switch is taken by the owner, because it is a trade-off between data and time.

## 6. Roles and deployments

- The application connects as `y_app`, and the purges as `y_maintenance` (product doc section 10.3). A rollback does not change the roles.
- A new table gets its grants by default (`ALTER DEFAULT PRIVILEGES` in the roles script). A new append-only table must revoke `UPDATE` and `DELETE` from `y_app` in its own migration (DEC-129).

## 7. Checklist for a rollback

- [ ] The cause is noted (image tag, migration name, error message).
- [ ] The rollback target is the image tag from before the deploy, or a corrective migration.
- [ ] A dump exists for the moment before the deploy.
- [ ] `GET /health` returns `200` and `status: ok` after the rollback.
- [ ] The failed version and its logs are kept for the review.
- [ ] The incident is written in the decision journal if it changed a rule.

## 8. What is not covered yet

- Automatic rollback: not planned for M0.
- Restore on the staging server: step 12, after the OVH server is set up. The scripts are tested locally only.
- The nightly backup job (cron) is not installed yet: it is set up on the server with the encryption key, which never goes to Git (M0 step 11).
- Rollback of the e-mail provider: no provider is connected yet (DEC-110).
