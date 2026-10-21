-- Maintenance grants of the account purge (R16, DEC-024, DEC-067, DEC-065), run by the retention purge.
-- Columns are listed one by one: the purge reads the status and the purge date of an account, and writes only the
-- personal fields and the counters that the erasure changes (DEC-166). Nothing else of the users table is open to it.
-- Conditional: skipped when the role does not exist yet; database/roles.sql grants the same rights on a fresh environment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'y_maintenance') THEN
    GRANT SELECT (id, status, deletion_purge_at, follower_count, following_count) ON "users" TO y_maintenance;
    GRANT UPDATE (status, status_changed_at, deleted_at, handle, display_name, email, phone, password_hash, birth_date, bio, avatar_url, suspension_reason, role, failed_login_count, locked_until, follower_count, following_count, updated_at) ON "users" TO y_maintenance;
    GRANT UPDATE (deleted_at, like_count, dislike_count, y_count, reply_count) ON "questions" TO y_maintenance;
    GRANT UPDATE (deleted_at, like_count, dislike_count) ON "replies" TO y_maintenance;
    GRANT SELECT, DELETE ON "question_reactions", "reply_reactions", "follows", "blocks", "bookmarks", "notifications", "notification_preferences", "conversation_participants", "age_verifications", "admin_mfa", "admin_backup_codes" TO y_maintenance;
  END IF;
END
$$;
