-- The age check now uses the birth date declared at signup (owner decision 2026-10-21, DEC-216).
-- Only the default changes: existing rows keep the provider they were written with.
ALTER TABLE "age_verifications" ALTER COLUMN "provider" SET DEFAULT 'declared';
