-- Narrows the content erasure grant of y_maintenance (section 13, DEC-067): the purge writes only the body of
-- questions and replies, so no other column is writable by it. Corrective migration: 20261020190000 is already applied.
-- Conditional: skipped when the role does not exist yet; roles.sql grants the same rights on a fresh environment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'y_maintenance') THEN
    REVOKE UPDATE ON "questions", "replies" FROM y_maintenance;
    GRANT UPDATE ("body") ON "questions", "replies" TO y_maintenance;
  END IF;
END
$$;
