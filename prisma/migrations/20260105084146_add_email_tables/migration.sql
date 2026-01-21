-- CreateTable
CREATE TABLE "round_admin_emails" (
    "id" SERIAL NOT NULL,
    "round_admin_id" INTEGER NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "round_admin_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_emails" (
    "id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "round_admin_emails_round_admin_id_email_key" ON "round_admin_emails"("round_admin_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "application_emails_application_id_email_key" ON "application_emails"("application_id", "email");

-- AddForeignKey
ALTER TABLE "round_admin_emails" ADD CONSTRAINT "round_admin_emails_round_admin_id_fkey" FOREIGN KEY ("round_admin_id") REFERENCES "round_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_emails" ADD CONSTRAINT "application_emails_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add email validation CHECK constraints
ALTER TABLE "round_admin_emails" ADD CONSTRAINT "round_admin_emails_email_check" CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
ALTER TABLE "application_emails" ADD CONSTRAINT "application_emails_email_check" CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
