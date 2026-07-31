-- Flow Splitter API storage. No foreign keys into the council tables: a
-- splitter has no round, and coupling them would let a council-side delete
-- cascade into an unrelated pool's integration.
-- pool_id is the uint256 pool id as text, following the nft_token_id precedent.

-- CreateTable splitter_api_keys
CREATE TABLE IF NOT EXISTS "splitter_api_keys" (
  "id"             SERIAL PRIMARY KEY,
  "chain_id"       INTEGER NOT NULL,
  "pool_id"        VARCHAR(78) NOT NULL,
  "key_hash"       VARCHAR(64) NOT NULL,
  "key_prefix"     VARCHAR(16) NOT NULL,
  "label"          VARCHAR(100) NOT NULL,
  "last_used_at"   TIMESTAMPTZ,
  "cooldown_until" TIMESTAMPTZ,
  "revoked_at"     TIMESTAMPTZ,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constant-time lookup by hashed token, and dedupe.
CREATE UNIQUE INDEX IF NOT EXISTS "splitter_api_keys_key_hash_key"
  ON "splitter_api_keys"("key_hash");

-- Per-pool listing and the active-key cap check.
CREATE INDEX IF NOT EXISTS "splitter_api_keys_chain_id_pool_id_idx"
  ON "splitter_api_keys"("chain_id", "pool_id");

-- CreateTable splitter_integrations: one row per API-controlled pool, also the
-- rate-limit claim row, so it is created on demand rather than depending on
-- key-mint lifecycle.
CREATE TABLE IF NOT EXISTS "splitter_integrations" (
  "chain_id"      INTEGER NOT NULL,
  "pool_id"       VARCHAR(78) NOT NULL,
  "last_write_at" TIMESTAMPTZ,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "splitter_integrations_pkey" PRIMARY KEY ("chain_id", "pool_id")
);
