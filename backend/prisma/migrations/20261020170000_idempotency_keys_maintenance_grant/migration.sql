-- Maintenance grant of idempotency_keys, purged by the retention purge (product doc section 10.2).
-- Conditional: skipped when the role does not exist yet; roles.sql then grants it on a fresh environment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'y_maintenance') THEN
    GRANT SELECT, DELETE ON "idempotency_keys" TO y_maintenance;
  END IF;
END
$$;
