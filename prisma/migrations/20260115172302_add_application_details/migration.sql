-- AlterEnum
ALTER TYPE "ApplicationStatus" ADD VALUE 'INCOMPLETE';

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "details" JSONB;
