/*
  Warnings:

  - A unique constraint covering the columns `[chain_id,flow_council_address]` on the table `rounds` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `flow_council_address` to the `rounds` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "rounds" ADD COLUMN     "flow_council_address" VARCHAR(42) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "rounds_chain_id_flow_council_address_key" ON "rounds"("chain_id", "flow_council_address");

-- AddCheck for lowercase ethereum address
ALTER TABLE "rounds" ADD CONSTRAINT "valid_flow_council_address" CHECK ("flow_council_address" ~ '^0x[a-f0-9]{40}$');
