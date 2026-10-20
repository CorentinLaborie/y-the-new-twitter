-- Maintenance grants of the content erasure (section 13, DEC-067), run by the retention purge.
-- Conditional: skipped when the role does not exist yet; roles.sql grants the same rights on a fresh environment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'y_maintenance') THEN
    GRANT SELECT, UPDATE ON "questions", "replies" TO y_maintenance;
    GRANT SELECT, DELETE ON "question_hashtags", "mentions" TO y_maintenance;
  END IF;
END
$$;
