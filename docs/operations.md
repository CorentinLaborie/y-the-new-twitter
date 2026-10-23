# Y — Operations: rollback procedure

> **Status (2026-10-22):** the production server runs (section 8). The backup job is the one of `ops/backup/backup.sh`, which encrypts every dump. The restore test on real data is still to do (section 4).

## 1. Principles

- **Forward-only migrations.** An applied migration is never edited or deleted. A broken migration is fixed by a new, corrective migration (DEC-056, product doc section 10.2).
- **The previous version stays available.** Every deploy keeps the previous container image, under its version tag, so that the application can be started again without a rebuild.
- **A backup before every deploy.** The database is dumped just before a migration runs. The dump is the way back if a migration damages data.
- **Health first.** After any deploy or rollback, `GET /health` must return `200` with `"status": "ok"` before the change is considered done (section 7 of the product doc).

## 2. Before each deploy

1. Confirm the checks pass locally (lint, tests, end-to-end tests, `openapi:check`, security scans).
2. Dump the database with the backup job, which encrypts the dump and keeps 14 days: `DATABASE_URL=… BACKUP_DIR=… BACKUP_KEY_FILE=… ops/backup/backup.sh`. It writes `y-<timestamp>.dump.enc`.
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
# 1. Decrypt the dump with the key file of the server (never in Git).
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in y-<timestamp>.dump.enc -out restore.dump -pass file:$BACKUP_KEY_FILE
# 2. Restore it into a scratch database, never into production.
createdb -h "$DB_HOST" -U "$DB_OWNER" y_restore
pg_restore --no-owner -d "postgresql://$DB_OWNER@$DB_HOST/y_restore" restore.dump
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

## 8. Server set-up (OVH VPS, 2026-10-22)

State of the production server `135.125.53.103` (Ubuntu, user `ubuntu`, SSH key only for new work). No secret is written here: each file below is owned by `ubuntu` and mode `600`.

**Network**
- DNS (OVH zone, A records): `y.corentin-laborie.com` and `admin-y.corentin-laborie.com` point to `135.125.53.103`. `corentin-laborie.com` still points to another address and is moved in a separate step.
- Firewall (`ufw`, default deny): 22, 80 and 443 only. PostgreSQL and the application ports are bound to `127.0.0.1` and are not reachable from outside.
- nginx (`/etc/nginx/sites-available/y.conf`): one TLS server block per host, from Let's Encrypt (certbot, automatic renewal). `/api/` goes to the backend on `127.0.0.1:8080`; everything else goes to the frontend on `127.0.0.1:3000`. `X-Forwarded-For` is overwritten with the client address, never appended. The back-office root redirects to `/admin`.
- Security headers come from `/etc/nginx/snippets/y-security-headers.conf` (HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`). No Content-Security-Policy yet.

**Database**
- PostgreSQL 18.6 in Docker: container `y-prod-postgres-1`, compose file `/srv/y/db/docker-compose.prod.yml`, same digest as the repository. Passwords in `/srv/y/db/db.env`.
- Migrations applied with the owner role, then `backend/database/roles.sql` (roles `y_app`, `y_maintenance`, `y_backup`). The application role cannot delete rows of `admin_audit_log`.

**Services** (systemd, start at boot, restart on failure)
- `y-backend`: `/srv/y/backend`, configuration in `/srv/y/backend/.env`, production profile. It refuses to start if a required key is missing.
- `y-frontend`: `/srv/y/frontend`, built with `NEXT_PUBLIC_API_URL=https://y.corentin-laborie.com`.
- `TRUST_PROXY_HOPS=1`: the backend sits behind one reverse proxy.

**Personal website** (`/srv/site`): systemd unit `site` on `127.0.0.1:3001`, built with `SITE_URL=https://corentin-laborie.com`. Its contact-form keys are in `/srv/site/.env.production` (Brevo key and sender address). nginx vhost `/etc/nginx/sites-available/site.conf`, with its Let's Encrypt certificate (valid until 2027-01-19, automatic renewal) and the same security headers as Y. The root and `www` names point to `135.125.53.103`; `www` and plain HTTP redirect to `https://corentin-laborie.com`. The certificate covers both names.

**Backups**: `ops/backup/backup.sh` runs every night at 03:30 (crontab of `ubuntu`). Its settings are in `/etc/y/backup.env` (mode 600, read-only role `y_backup`). Dumps are encrypted with `/etc/y/backup.key` and written to `/var/backups/y`, 14 days kept. Logs: `~/logs/y-backup.log`. A test dump was made on 2026-10-22, and restored into a scratch database (`y_restore_test`, dropped afterwards): the restore passed and the row counts matched the source. The production database was still empty, so this proves the chain, not the restore of real data. Repeat the test once data exists.

**Restore test with data (2026-10-23)**: a fresh dump was taken with `ops/backup/backup.sh` (`y-20261023T103139Z.dump.enc`), decrypted with `/etc/y/backup.key`, and restored with `pg_restore --no-owner --no-privileges` into a new scratch database `y_restore_test`. Row counts matched the source: `users` 28, `questions` 60, `replies` 212. The scratch database was then dropped. The data is fictional (`example.test` accounts, no administrator), which the owner accepts as test data for this check.

The `www` name points to the server and redirects to the root name.

## 9. What is not covered yet

- Automatic rollback: not planned for M0.
- Restore on the staging server: step 12, after the OVH server is set up. The scripts are tested locally only.
- The nightly backup job is installed on the server (crontab of `ubuntu`, 03:30, section 8). The encryption key stays on the server, never in Git.
- Rollback of the e-mail provider: no provider is connected yet (DEC-110).
