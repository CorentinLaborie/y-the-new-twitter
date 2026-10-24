-- The purge erases the address and the reason typed for a user's deletion (plan L5, step 7): both are personal data.
-- Conditional, like the other purge grants: skipped when the maintenance role does not exist yet, and database/roles.sql
-- grants the same columns on a fresh environment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'y_maintenance') THEN
    GRANT UPDATE (deletion_reason, deletion_email) ON "users" TO y_maintenance;
  END IF;
END
$$;
