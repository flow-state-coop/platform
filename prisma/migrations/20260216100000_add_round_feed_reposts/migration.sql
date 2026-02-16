-- CreateTable
CREATE TABLE "round_feed_reposts" (
    "id" SERIAL NOT NULL,
    "message_id" INTEGER NOT NULL,
    "round_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "round_feed_reposts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_round_feed_reposts_round" ON "round_feed_reposts"("round_id");

-- CreateIndex
CREATE UNIQUE INDEX "round_feed_reposts_message_id_round_id_key" ON "round_feed_reposts"("message_id", "round_id");

-- AddForeignKey
ALTER TABLE "round_feed_reposts" ADD CONSTRAINT "round_feed_reposts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_feed_reposts" ADD CONSTRAINT "round_feed_reposts_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
