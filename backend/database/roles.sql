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
-- The purges of each table are granted to y_maintenance by the migration that creates the table or the purge
-- (conditional on the role, product doc section 10.2). This script only creates the roles.

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

-- Maintenance: delete old rows of the two logs, and expired codes, sessions and idempotency keys for the retention purge
-- (DEC-059, DEC-065, DEC-068), and nothing else.
-- On a fresh environment the migrations run before this script, so their conditional grants (no role yet) are
-- skipped: this line gives the same rights. Migrations that run after the role exists grant them themselves.
-- DELETE with a WHERE clause also needs SELECT on the columns it reads.
GRANT SELECT, DELETE ON admin_audit_log, login_events, signup_codes, password_reset_codes, email_change_codes, sessions, idempotency_keys TO y_maintenance;
-- Content erasure after 90 days (section 13, DEC-067): the text of questions and replies, and their hashtag links and mentions.
-- Only the body is written: no other column of questions or replies is open to the purge.
GRANT SELECT ON questions, replies TO y_maintenance;
GRANT UPDATE (body) ON questions, replies TO y_maintenance;
GRANT SELECT, DELETE ON question_hashtags, mentions TO y_maintenance;
-- The retention purge takes its lease here (owner decision 2026-10-20): read, insert and take over an expired lease.
GRANT SELECT, INSERT, UPDATE ON job_leases TO y_maintenance;
-- Account purge (R16, DEC-024): the columns of users that the erasure writes, and the counters it moves (DEC-166).
-- Private messages keep their row with an empty body, and contact threads are deleted with their messages (DEC-029, DEC-024).
GRANT SELECT (sender_id), UPDATE (body) ON messages TO y_maintenance;
GRANT SELECT, DELETE ON support_threads, support_messages TO y_maintenance;
GRANT SELECT (id, status, deletion_purge_at, follower_count, following_count) ON users TO y_maintenance;
GRANT UPDATE (status, status_changed_at, deleted_at, handle, display_name, email, phone, password_hash, birth_date, bio, avatar_url, suspension_reason, role, failed_login_count, locked_until, follower_count, following_count, updated_at) ON users TO y_maintenance;
GRANT UPDATE (deleted_at, like_count, dislike_count, y_count, reply_count) ON questions TO y_maintenance;
GRANT UPDATE (deleted_at, like_count, dislike_count) ON replies TO y_maintenance;
GRANT SELECT, DELETE ON question_reactions, reply_reactions, follows, blocks, bookmarks, notifications, notification_preferences, conversation_participants, age_verifications TO y_maintenance;

-- Backup: read everything, write nothing.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO y_backup;

-- Tables created by later migrations get the same grants, when the migrations run as the role that runs this script.
-- A new append-only table must revoke UPDATE and DELETE from y_app in its own migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO y_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO y_backup;
