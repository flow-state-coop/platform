ALTER TABLE "rounds" ADD COLUMN "applications_closed" BOOLEAN NOT NULL DEFAULT false;

UPDATE "rounds"
SET "applications_closed" = true, "updated_at" = NOW()
WHERE "chain_id" = 42220
  AND "flow_council_address" = '0xfabef1abae4998146e8a8422813eb787caa26ec2';
