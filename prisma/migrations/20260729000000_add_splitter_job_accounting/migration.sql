-- Running totals for a write job, carried on the job row rather than in the
-- runner's memory. A job that is resumed after its runner died, or that burns
-- through its attempts, still has to report what the whole write changed and
-- what it cost: counters scoped to one attempt record the last attempt only,
-- and the terminal-failure path has no in-memory counters at all.
ALTER TABLE "splitter_write_jobs"
  ADD COLUMN IF NOT EXISTS "changed_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "gas_used" VARCHAR(78) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS "gas_cost_wei" VARCHAR(78) NOT NULL DEFAULT '0';
