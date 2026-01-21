/*
  Warnings:

  - You are about to drop the `grantee_managers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `grantees` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "grantee_managers" DROP CONSTRAINT "grantee_managers_grantee_id_fkey";

-- DropForeignKey
ALTER TABLE "grantees" DROP CONSTRAINT "grantees_application_id_fkey";

-- DropTable
DROP TABLE "grantee_managers";

-- DropTable
DROP TABLE "grantees";

-- CreateTable
CREATE TABLE "recipients" (
    "id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipient_managers" (
    "id" SERIAL NOT NULL,
    "recipient_id" INTEGER NOT NULL,
    "manager_address" VARCHAR(42) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipient_managers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recipients_application_id_key" ON "recipients"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipient_managers_recipient_id_manager_address_key" ON "recipient_managers"("recipient_id", "manager_address");

-- AddForeignKey
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipient_managers" ADD CONSTRAINT "recipient_managers_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
