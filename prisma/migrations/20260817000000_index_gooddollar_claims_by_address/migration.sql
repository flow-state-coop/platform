-- Voter removal releases claims by (round_id, address), which the unique index
-- on (round_id, root_address) cannot serve, so every removal seq-scanned the
-- table.
CREATE INDEX IF NOT EXISTS "gooddollar_claimed_roots_round_id_address_idx"
  ON "gooddollar_claimed_roots"("round_id", "address");
