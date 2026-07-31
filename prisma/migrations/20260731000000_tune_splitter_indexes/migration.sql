-- Align the splitter indexes with the queries that actually run.

-- The history listing filters by pool and pages by id, so the created_at
-- tail column served nothing past its prefix and every page paid a sort.
DROP INDEX IF EXISTS "splitter_write_history_chain_id_pool_id_created_at_idx";
CREATE INDEX IF NOT EXISTS "splitter_write_history_chain_id_pool_id_id_idx"
  ON "splitter_write_history"("chain_id", "pool_id", "id");

-- No query scans heartbeat_at on its own: the in-flight check reads it behind
-- the (chain_id, pool_id, status) index and claims go by primary key. The
-- expiry sweeps do filter bare expires_at, which had no index at all.
DROP INDEX IF EXISTS "splitter_write_jobs_heartbeat_at_idx";
CREATE INDEX IF NOT EXISTS "splitter_write_jobs_expires_at_idx"
  ON "splitter_write_jobs"("expires_at");
