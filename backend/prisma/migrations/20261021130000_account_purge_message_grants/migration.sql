-- Maintenance grants of the account purge for private messages and contact threads (DEC-029, DEC-024, DEC-080, DEC-119),
-- run by the retention purge. The purge writes only the body of the messages the account sent, and deletes the contact
-- threads of the account with their messages.
-- Conditional: skipped when the role does not exist yet; database/roles.sql grants the same rights on a fresh environment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'y_maintenance') THEN
    GRANT SELECT (sender_id), UPDATE (body) ON "messages" TO y_maintenance;
    GRANT SELECT, DELETE ON "support_threads", "support_messages" TO y_maintenance;
  END IF;
END
$$;
