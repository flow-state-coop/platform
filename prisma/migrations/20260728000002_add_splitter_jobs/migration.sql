-- Job state, the written-register mirror, and write history for the Flow
-- Splitter API.

-- CreateTable splitter_write_jobs.
-- heartbeat_at is NOT NULL DEFAULT NOW() deliberately: the check that stops a
-- second write being accepted while one is in flight reads it directly, and a
-- null on a freshly queued row would read as "not running", letting two runners
-- onto one pool and double-spending gas.
CREATE TABLE IF NOT EXISTS "splitter_write_jobs" (
  "id"           VARCHAR(36) PRIMARY KEY,
  "chain_id"     INTEGER NOT NULL,
  "pool_id"      VARCHAR(78) NOT NULL,
  "key_id"       INTEGER NOT NULL,
  "payload_hash" VARCHAR(64) NOT NULL,
  "status"       VARCHAR(20) NOT NULL,
  "target"       JSONB NOT NULL,
  "batch_index"  INTEGER NOT NULL DEFAULT 0,
  "tx_hashes"    TEXT[] NOT NULL DEFAULT '{}',
  "attempt"      INTEGER NOT NULL DEFAULT 0,
  "heartbeat_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "error"        TEXT,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expires_at"   TIMESTAMPTZ NOT NULL
);

-- In-flight lookup for a pool.
CREATE INDEX IF NOT EXISTS "splitter_write_jobs_chain_id_pool_id_status_idx"
  ON "splitter_write_jobs"("chain_id", "pool_id", "status");

-- Staleness scan for jobs whose runner died.
CREATE INDEX IF NOT EXISTS "splitter_write_jobs_heartbeat_at_idx"
  ON "splitter_write_jobs"("heartbeat_at");

-- CreateTable splitter_written_register: the mirror of what the platform last
-- wrote. A candidate-address list only; units always come from the chain.
CREATE TABLE IF NOT EXISTS "splitter_written_register" (
  "chain_id"   INTEGER NOT NULL,
  "pool_id"    VARCHAR(78) NOT NULL,
  "address"    VARCHAR(42) NOT NULL,
  "units"      VARCHAR(78) NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "splitter_written_register_pkey"
    PRIMARY KEY ("chain_id", "pool_id", "address")
);

-- CreateTable splitter_write_history. No expires_at: history is kept
-- indefinitely, while jobs expire at 7 days.
CREATE TABLE IF NOT EXISTS "splitter_write_history" (
  "id"            SERIAL PRIMARY KEY,
  "chain_id"      INTEGER NOT NULL,
  "pool_id"       VARCHAR(78) NOT NULL,
  "key_id"        INTEGER,
  "job_id"        VARCHAR(36),
  "changed_count" INTEGER NOT NULL,
  "status"        VARCHAR(20) NOT NULL,
  "tx_hashes"     TEXT[] NOT NULL DEFAULT '{}',
  "gas_used"      VARCHAR(78),
  "gas_cost_wei"  VARCHAR(78),
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Newest-first listing for a pool's admin UI.
CREATE INDEX IF NOT EXISTS "splitter_write_history_chain_id_pool_id_created_at_idx"
  ON "splitter_write_history"("chain_id", "pool_id", "created_at");

-- Per-key cost attribution.
CREATE INDEX IF NOT EXISTS "splitter_write_history_key_id_idx"
  ON "splitter_write_history"("key_id");
