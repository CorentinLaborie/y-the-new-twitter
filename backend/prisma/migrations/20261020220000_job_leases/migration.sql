-- CreateTable
CREATE TABLE "job_leases" (
    "key" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_leases_pkey" PRIMARY KEY ("key")
);

-- Maintenance grant: the retention purge takes its lease here. Conditional: skipped when the role does not exist yet;
-- database/roles.sql then grants it on a fresh environment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'y_maintenance') THEN
    GRANT SELECT, INSERT, UPDATE ON "job_leases" TO y_maintenance;
  END IF;
END
$$;
