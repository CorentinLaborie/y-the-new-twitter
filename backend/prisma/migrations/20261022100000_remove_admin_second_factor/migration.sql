-- The back-office second factor is removed (owner decision, 2026-10-22): an administrator signs in with the
-- email and the password only. The two tables were empty on production when they were dropped.
DROP TABLE IF EXISTS "admin_backup_codes";
DROP TABLE IF EXISTS "admin_mfa";
