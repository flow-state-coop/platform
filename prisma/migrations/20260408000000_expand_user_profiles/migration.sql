-- AlterTable
ALTER TABLE "user_profiles"
  ADD COLUMN "bio" VARCHAR(300),
  ADD COLUMN "twitter" VARCHAR(255),
  ADD COLUMN "github" VARCHAR(255),
  ADD COLUMN "linkedin" VARCHAR(255),
  ADD COLUMN "farcaster" VARCHAR(255),
  ADD COLUMN "email" VARCHAR(255),
  ADD COLUMN "telegram" VARCHAR(255);
