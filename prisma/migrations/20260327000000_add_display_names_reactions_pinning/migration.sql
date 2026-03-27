-- CreateTable
CREATE TABLE "user_profiles" (
    "id" SERIAL NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "display_name" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reactions" (
    "id" SERIAL NOT NULL,
    "message_id" INTEGER NOT NULL,
    "author_address" VARCHAR(42) NOT NULL,
    "emoji" VARCHAR(8) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "pinned_at" TIMESTAMP(3),
ADD COLUMN "pinned_by" VARCHAR(42);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_address_key" ON "user_profiles"("address");

-- CreateIndex
CREATE UNIQUE INDEX "message_reactions_message_id_author_address_emoji_key" ON "message_reactions"("message_id", "author_address", "emoji");

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
