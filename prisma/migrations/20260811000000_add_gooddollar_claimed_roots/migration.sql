-- CreateTable gooddollar_claimed_roots: the GoodDollar identity behind every
-- self-claimed voter slot. Verification is anchored to one address (the root),
-- and its holder can connect any number of extra wallets to it, so keying the
-- claim on the claiming wallet alone would hand one person a vote per wallet.
CREATE TABLE IF NOT EXISTS "gooddollar_claimed_roots" (
  "id"           SERIAL PRIMARY KEY,
  "round_id"     INTEGER NOT NULL,
  "root_address" VARCHAR(42) NOT NULL,
  "address"      VARCHAR(42) NOT NULL,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One claim per identity per council. This is the enforcement, not a helper for
-- the check-then-insert in POST /api/flow-council/eligibility, which two
-- connected wallets claiming at once would otherwise race.
CREATE UNIQUE INDEX IF NOT EXISTS "gooddollar_claimed_roots_round_id_root_address_key"
  ON "gooddollar_claimed_roots"("round_id", "root_address");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gooddollar_claimed_roots_round_id_fkey'
  ) THEN
    ALTER TABLE "gooddollar_claimed_roots"
      ADD CONSTRAINT "gooddollar_claimed_roots_round_id_fkey"
      FOREIGN KEY ("round_id") REFERENCES "rounds"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill the councils already running self-claim. A wallet that claimed did
-- it by passing an isWhitelisted check, which only a root answers true to, so
-- it is its own root. A wallet an admin added by hand may be a connected wallet
-- instead, and its root goes unrecorded here — SQL cannot ask Celo. Those, and
-- the verified voters sitting in the manual groups of a GoodDollar council, are
-- covered at claim time instead: a wallet whose root is already voting on the
-- council is refused, and enabling GoodDollar on a council from now on records
-- its existing voters' identities up front.
INSERT INTO "gooddollar_claimed_roots" ("round_id", "root_address", "address")
SELECT m."round_id", lower(m."address"), lower(m."address")
FROM "voter_group_members" m
JOIN "voter_groups" g ON g."id" = m."voter_group_id"
WHERE g."eligibility_method" = 'gooddollar'
ON CONFLICT DO NOTHING;
