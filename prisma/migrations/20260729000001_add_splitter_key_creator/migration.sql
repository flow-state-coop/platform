-- The wallet that minted an API key. Nullable because keys minted before this
-- column existed have no attributable creator, and because the key stays valid
-- either way: a key outliving the adminship that created it is a policy
-- question, while an admin being unable to tell one integration's key from a
-- co-admin's is an immediate one. Label and key_prefix are both minter-chosen or
-- opaque, so without this there is nothing to tell them apart by.
ALTER TABLE "splitter_api_keys"
  ADD COLUMN IF NOT EXISTS "created_by" VARCHAR(42);
