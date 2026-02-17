-- DropForeignKey
ALTER TABLE "round_feed_reposts" DROP CONSTRAINT "round_feed_reposts_message_id_fkey";

-- DropForeignKey
ALTER TABLE "round_feed_reposts" DROP CONSTRAINT "round_feed_reposts_round_id_fkey";

-- DropTable
DROP TABLE "round_feed_reposts";
