-- The origin of a pending deletion (R16, owner decision 2026-10-21): 'user' for the deletion the user asked for, which a
-- login inside the 90-day window cancels (DEC-030), and 'administrator' for a deletion an administrator started, which no
-- login cancels. Null when no deletion is pending.
-- Existing rows: until now only the user could start a deletion, so the pending ones are backfilled to 'user'.
-- No maintenance grant: the retention purge does not read or write this column.
CREATE TYPE "deletion_origin" AS ENUM ('user', 'administrator');

ALTER TABLE "users" ADD COLUMN "deletion_origin" "deletion_origin";

UPDATE "users" SET "deletion_origin" = 'user' WHERE "status" = 'pending_deletion';
