-- AlterTable voter_groups: per-council metrics rate-limit state (only metrics groups use it)
ALTER TABLE "voter_groups"
  ADD COLUMN IF NOT EXISTS "last_ballot_at" TIMESTAMPTZ;

-- CreateTable metrics_api_keys
CREATE TABLE IF NOT EXISTS "metrics_api_keys" (
  "id"             SERIAL PRIMARY KEY,
  "round_id"       INTEGER NOT NULL,
  "voter_group_id" INTEGER NOT NULL,
  "key_hash"       VARCHAR(64) NOT NULL,
  "key_prefix"     VARCHAR(16) NOT NULL,
  "label"          VARCHAR(100) NOT NULL,
  "last_used_at"   TIMESTAMPTZ,
  "revoked_at"     TIMESTAMPTZ,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index on key_hash (constant-time lookup + dedupe)
CREATE UNIQUE INDEX IF NOT EXISTS "metrics_api_keys_key_hash_key"
  ON "metrics_api_keys"("key_hash");

-- Index for per-council listing
CREATE INDEX IF NOT EXISTS "metrics_api_keys_round_id_idx"
  ON "metrics_api_keys"("round_id");

-- Index for per-group listing and the voter_group_id ON DELETE CASCADE lookup
CREATE INDEX IF NOT EXISTS "metrics_api_keys_voter_group_id_idx"
  ON "metrics_api_keys"("voter_group_id");

-- Foreign keys (idempotent: ADD CONSTRAINT does not support IF NOT EXISTS).
-- voter_group_id cascades: a group's keys are meaningless without it, and the
-- group-delete path only runs once the group is empty.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'metrics_api_keys_round_id_fkey'
  ) THEN
    ALTER TABLE "metrics_api_keys"
      ADD CONSTRAINT "metrics_api_keys_round_id_fkey"
      FOREIGN KEY ("round_id") REFERENCES "rounds"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'metrics_api_keys_voter_group_id_fkey'
  ) THEN
    ALTER TABLE "metrics_api_keys"
      ADD CONSTRAINT "metrics_api_keys_voter_group_id_fkey"
      FOREIGN KEY ("voter_group_id") REFERENCES "voter_groups"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
