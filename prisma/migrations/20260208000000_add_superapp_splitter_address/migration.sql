ALTER TABLE "rounds" ADD COLUMN "superapp_splitter_address" VARCHAR(42);

ALTER TABLE "rounds" ADD CONSTRAINT "rounds_superapp_splitter_address_check"
  CHECK (superapp_splitter_address ~ '^0x[a-f0-9]{40}$');

-- After manually deploying splitters for existing rounds:
-- UPDATE rounds SET superapp_splitter_address = '<address>' WHERE chain_id = <chain_id> AND flow_council_address = '<address>';
