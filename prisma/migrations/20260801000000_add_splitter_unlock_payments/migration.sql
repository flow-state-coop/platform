-- One-time API unlock payments, one row per verified on-chain transaction
-- rather than a flag on the integration row: the record of who paid what, in
-- which token, is what any future usage-based pricing starts from, and it
-- cannot be reconstructed later. A pool is unlocked when it has at least one
-- row.

-- CreateTable splitter_unlock_payments
CREATE TABLE IF NOT EXISTS "splitter_unlock_payments" (
  "id"         SERIAL PRIMARY KEY,
  "chain_id"   INTEGER NOT NULL,
  "pool_id"    VARCHAR(78) NOT NULL,
  "tx_hash"    VARCHAR(66) NOT NULL,
  "payer"      VARCHAR(42) NOT NULL,
  "token"      VARCHAR(42) NOT NULL,
  "amount"     VARCHAR(78) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The replay guard: one payment can never unlock two pools.
CREATE UNIQUE INDEX IF NOT EXISTS "splitter_unlock_payments_chain_id_tx_hash_key"
  ON "splitter_unlock_payments"("chain_id", "tx_hash");

-- The unlock check on every write.
CREATE INDEX IF NOT EXISTS "splitter_unlock_payments_chain_id_pool_id_idx"
  ON "splitter_unlock_payments"("chain_id", "pool_id");
