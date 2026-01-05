/*
  Warnings:

  - You are about to drop the `comments` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('INTERNAL_APPLICATION', 'GROUP_APPLICANTS', 'GROUP_GRANTEES', 'GROUP_ROUND_ADMINS', 'GROUP_PROJECT', 'PUBLIC_ROUND', 'PUBLIC_PROJECT');

-- DropForeignKey
ALTER TABLE "comments" DROP CONSTRAINT "comments_application_id_fkey";

-- DropTable
DROP TABLE "comments";

-- DropEnum
DROP TYPE "CommentVisibility";

-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "channel_type" "ChannelType" NOT NULL,
    "round_id" INTEGER,
    "project_id" INTEGER,
    "application_id" INTEGER,
    "author_address" VARCHAR(42) NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_messages_round_feed" ON "messages"("channel_type", "round_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_messages_project_feed" ON "messages"("channel_type", "project_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_messages_application_feed" ON "messages"("channel_type", "application_id", "created_at");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
