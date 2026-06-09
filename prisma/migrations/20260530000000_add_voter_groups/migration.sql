-- CreateTable voter_groups
CREATE TABLE IF NOT EXISTS "voter_groups" (
  "id"                   SERIAL PRIMARY KEY,
  "round_id"             INTEGER NOT NULL,
  "name"                 VARCHAR(100) NOT NULL,
  "eligibility_method"   VARCHAR(50) NOT NULL,
  "default_voting_power" INTEGER NOT NULL DEFAULT 10,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CreateTable voter_group_members
CREATE TABLE IF NOT EXISTS "voter_group_members" (
  "id"             SERIAL PRIMARY KEY,
  "voter_group_id" INTEGER NOT NULL,
  "round_id"       INTEGER NOT NULL,
  "address"        VARCHAR(42) NOT NULL,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS "voter_groups_round_id_name_key"
  ON "voter_groups"("round_id", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "voter_group_members_round_id_address_key"
  ON "voter_group_members"("round_id", "address");

-- Foreign keys (idempotent: ADD CONSTRAINT does not support IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'voter_groups_round_id_fkey'
  ) THEN
    ALTER TABLE "voter_groups"
      ADD CONSTRAINT "voter_groups_round_id_fkey"
      FOREIGN KEY ("round_id") REFERENCES "rounds"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'voter_group_members_voter_group_id_fkey'
  ) THEN
    ALTER TABLE "voter_group_members"
      ADD CONSTRAINT "voter_group_members_voter_group_id_fkey"
      FOREIGN KEY ("voter_group_id") REFERENCES "voter_groups"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'voter_group_members_round_id_fkey'
  ) THEN
    ALTER TABLE "voter_group_members"
      ADD CONSTRAINT "voter_group_members_round_id_fkey"
      FOREIGN KEY ("round_id") REFERENCES "rounds"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
