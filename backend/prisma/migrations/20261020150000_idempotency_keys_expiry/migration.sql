-- Idempotency keys expire 24 hours after first use (owner decision, 2026-10-20).
-- An expired key is treated as absent by the API; the daily retention purge deletes it.
ALTER TABLE "idempotency_keys" ADD COLUMN "expires_at" TIMESTAMPTZ(3);
UPDATE "idempotency_keys" SET "expires_at" = "created_at" + INTERVAL '24 hours';
ALTER TABLE "idempotency_keys" ALTER COLUMN "expires_at" SET NOT NULL;

-- The purge deletes by expiry
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");
