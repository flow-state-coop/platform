-- AlterTable voter_groups: per-group NFT gate config (only 'nft' groups use it)
ALTER TABLE "voter_groups"
  ADD COLUMN IF NOT EXISTS "nft_contract_address" VARCHAR(42),
  ADD COLUMN IF NOT EXISTS "nft_token_standard"   VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "nft_token_id"         VARCHAR(78),
  ADD COLUMN IF NOT EXISTS "nft_acquisition_url"  TEXT,
  ADD COLUMN IF NOT EXISTS "nft_collection_name"  VARCHAR(100);

-- AlterTable rounds: per-council claim rate-limit slot. Council-scoped, so it
-- must not reuse voter_groups.last_ballot_at (group-scoped, metrics-owned).
ALTER TABLE "rounds"
  ADD COLUMN IF NOT EXISTS "last_claim_at" TIMESTAMPTZ;

-- Repair: 20260617000000_add_metrics_voter is recorded as applied in every
-- environment, but voter_groups_round_metrics_unique exists in none of them, so
-- the one-metrics-group-per-council rule has only ever been enforced in the
-- application layer by a check-then-insert that two concurrent requests can
-- race. Recreated here rather than by editing that migration, whose checksum is
-- already recorded. Verified zero duplicate metrics groups in production and the
-- test branch before adding this, so it cannot fail on existing data.
CREATE UNIQUE INDEX IF NOT EXISTS "voter_groups_round_metrics_unique"
  ON "voter_groups"("round_id") WHERE "eligibility_method" = 'metrics';

-- One NFT group per (council, collection, token id): DB-level backstop for the
-- check-then-insert in POST/PATCH /api/flow-council/voter-groups, which two
-- concurrent requests could race. lower() so a case-flipped address can't
-- bypass it; COALESCE so NULL token ids (ERC-721) are not all distinct, which
-- is what makes "one group per ERC-721 collection per council" hold.
CREATE UNIQUE INDEX IF NOT EXISTS "voter_groups_round_nft_unique"
  ON "voter_groups"("round_id", lower("nft_contract_address"), COALESCE("nft_token_id", ''))
  WHERE "eligibility_method" = 'nft';
