/*
  Warnings:

  - You are about to drop the column `details` on the `applications` table. All the data in the column will be lost.
  - You are about to drop the `application_emails` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `recipient_managers` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[project_id,round_id]` on the table `applications` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `project_id` to the `applications` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "application_emails" DROP CONSTRAINT "application_emails_application_id_fkey";

-- DropForeignKey
ALTER TABLE "recipient_managers" DROP CONSTRAINT "recipient_managers_recipient_id_fkey";

-- AlterTable
ALTER TABLE "applications" DROP COLUMN "details",
ADD COLUMN     "project_id" INTEGER NOT NULL;

-- DropTable
DROP TABLE "application_emails";

-- DropTable
DROP TABLE "recipient_managers";

-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_emails" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_managers" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "manager_address" VARCHAR(42) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_managers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_emails_project_id_email_key" ON "project_emails"("project_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "project_managers_project_id_manager_address_key" ON "project_managers"("project_id", "manager_address");

-- CreateIndex
CREATE UNIQUE INDEX "applications_project_id_round_id_key" ON "applications"("project_id", "round_id");

-- AddForeignKey
ALTER TABLE "project_emails" ADD CONSTRAINT "project_emails_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_managers" ADD CONSTRAINT "project_managers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
