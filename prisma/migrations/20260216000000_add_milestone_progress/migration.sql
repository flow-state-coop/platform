-- CreateTable
CREATE TABLE "milestone_progress" (
    "id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "milestone_type" VARCHAR(10) NOT NULL,
    "milestone_index" INTEGER NOT NULL,
    "progress" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestone_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "milestone_progress_application_id_milestone_type_milestone_i_key" ON "milestone_progress"("application_id", "milestone_type", "milestone_index");

-- AddForeignKey
ALTER TABLE "milestone_progress" ADD CONSTRAINT "milestone_progress_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
