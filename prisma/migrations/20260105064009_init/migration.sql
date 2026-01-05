-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'CHANGES_REQUESTED', 'REJECTED', 'REMOVED', 'GRADUATED');

-- CreateEnum
CREATE TYPE "CommentVisibility" AS ENUM ('INTERNAL', 'SHARED');

-- CreateTable
CREATE TABLE "rounds" (
    "id" SERIAL NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_admins" (
    "id" SERIAL NOT NULL,
    "round_id" INTEGER NOT NULL,
    "admin_address" VARCHAR(42) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "round_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" SERIAL NOT NULL,
    "round_id" INTEGER NOT NULL,
    "funding_address" VARCHAR(42) NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grantees" (
    "id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grantees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grantee_managers" (
    "id" SERIAL NOT NULL,
    "grantee_id" INTEGER NOT NULL,
    "manager_address" VARCHAR(42) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grantee_managers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "author_address" VARCHAR(42) NOT NULL,
    "message" TEXT NOT NULL,
    "visibility" "CommentVisibility" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "round_admins_round_id_admin_address_key" ON "round_admins"("round_id", "admin_address");

-- CreateIndex
CREATE INDEX "idx_applications_round" ON "applications"("round_id");

-- CreateIndex
CREATE UNIQUE INDEX "grantees_application_id_key" ON "grantees"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "grantee_managers_grantee_id_manager_address_key" ON "grantee_managers"("grantee_id", "manager_address");

-- CreateIndex
CREATE INDEX "idx_comments_feed" ON "comments"("application_id", "created_at");

-- AddForeignKey
ALTER TABLE "round_admins" ADD CONSTRAINT "round_admins_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grantees" ADD CONSTRAINT "grantees_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grantee_managers" ADD CONSTRAINT "grantee_managers_grantee_id_fkey" FOREIGN KEY ("grantee_id") REFERENCES "grantees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
