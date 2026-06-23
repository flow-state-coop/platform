-- AlterTable metrics_api_keys: per-key request cooldown. A key whose request did
-- RPC work but failed validation is cooled down for this window, so a misbehaving
-- key cannot drive the ballot multicalls on every request. Legit poll/submit
-- traffic never sets it, so polling cadence is unaffected.
ALTER TABLE "metrics_api_keys"
  ADD COLUMN IF NOT EXISTS "cooldown_until" TIMESTAMPTZ;
