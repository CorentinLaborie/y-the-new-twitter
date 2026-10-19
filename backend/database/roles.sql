-- Y database roles (M0 step 4.7, DEC-059, DEC-065, DEC-129).
--
-- Run once per environment, after the migrations, outside Prisma Migrate:
--   psql -U <owner> -d <db> -v db=<db> -v app_password=... -v maintenance_password=... -v backup_password=... -f database/roles.sql
-- Passwords are passed on the command line. They are never written in this file or in Git.
--
-- Roles:
--   y_app          the application (DATABASE_URL). Reads and writes its tables, but the two logs are append-only.
--   y_maintenance  the purge jobs (DATABASE_MAINTENANCE_URL). Deletes old rows of the two logs.
--   y_backup       read-only, for the backup job (step 11).
-- The purges of the other tables are granted to y_maintenance when each job is built (M1 to M7).

CREATE ROLE y_app LOGIN PASSWORD :'app_password';
CREATE ROLE y_maintenance LOGIN PASSWORD :'maintenance_password';
CREATE ROLE y_backup LOGIN PASSWORD :'backup_password';

GRANT CONNECT ON DATABASE :"db" TO y_app, y_maintenance, y_backup;
GRANT USAGE ON SCHEMA public TO y_app, y_maintenance, y_backup;

-- Application: read and write the tables (DEC-129).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO y_app;
-- The migration history is not the application's to change.
REVOKE ALL ON _prisma_migrations FROM y_app;
-- The two logs are append-only for the application (DEC-059).
REVOKE UPDATE, DELETE ON admin_audit_log, login_events FROM y_app;

-- Maintenance: delete old rows of the two logs, and nothing else (DEC-059, DEC-065).
-- DELETE with a WHERE clause also needs SELECT on the columns it reads.
GRANT SELECT, DELETE ON admin_audit_log, login_events TO y_maintenance;

-- Backup: read everything, write nothing.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO y_backup;

-- Tables created by later migrations get the same grants, when the migrations run as the role that runs this script.
-- A new append-only table must revoke UPDATE and DELETE from y_app in its own migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO y_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO y_backup;
