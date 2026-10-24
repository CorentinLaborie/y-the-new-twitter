-- The reason and the e-mail of a deletion that the user asked for (plan L5, step 7, owner decision 2026-10-23).
-- The reason is the label of one of the listed reasons, or the free text for "Autre", as the administrator's is written.
-- The e-mail is the address the user typed when asking: the deletion mail goes there. Both are null for the rows
-- that existed before, and for any deletion an administrator started, which keeps its own reason in the audit log.
-- Forward only, no data removed, no maintenance grant: the retention purge does not read these columns.
ALTER TABLE "users" ADD COLUMN "deletion_reason" TEXT;
ALTER TABLE "users" ADD COLUMN "deletion_email" VARCHAR(254);
