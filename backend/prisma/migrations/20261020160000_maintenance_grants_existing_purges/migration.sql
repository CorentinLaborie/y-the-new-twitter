-- Maintenance grants of the tables that the retention purges already delete (product doc section 10.2).
-- Conditional: the grant is skipped when the role does not exist yet. On a fresh environment roles.sql
-- creates the role after the migrations and grants the same rights, so no environment needs a manual step.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'y_maintenance') THEN
    GRANT SELECT, DELETE ON "admin_audit_log", "login_events", "signup_codes", "password_reset_codes", "email_change_codes", "sessions" TO y_maintenance;
  END IF;
END
$$;
