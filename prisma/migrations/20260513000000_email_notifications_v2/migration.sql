-- AlterTable user_profiles: notification preferences, consent, email version, suspension
ALTER TABLE "user_profiles"
  ADD COLUMN "notify_application_eligibility" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_project_channels"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_round_announcements"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_internal_review"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_platform"                BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "consent_confirmed_at"           TIMESTAMPTZ,
  ADD COLUMN "consent_version"                VARCHAR(20),
  ADD COLUMN "email_version"                  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "email_suspended_at"             TIMESTAMPTZ,
  ADD COLUMN "email_suspension_reason"        VARCHAR(20);

-- Partial unique index on email so a bounced address maps to exactly one profile
CREATE UNIQUE INDEX "user_profiles_email_unique"
  ON "user_profiles"("email")
  WHERE "email" IS NOT NULL;

-- CreateTable inbox_items
CREATE TABLE "inbox_items" (
  "id"                SERIAL PRIMARY KEY,
  "recipient_address" VARCHAR(42) NOT NULL,
  "message_id"        INTEGER,
  "application_id"    INTEGER,
  "category"          VARCHAR(50) NOT NULL,
  "source_label"      VARCHAR(255),
  "snippet"           VARCHAR(500),
  "read_at"           TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_inbox_items_recipient_unread"
  ON "inbox_items"("recipient_address", "read_at");

CREATE INDEX "idx_inbox_items_recipient_category"
  ON "inbox_items"("recipient_address", "category", "created_at");

ALTER TABLE "inbox_items"
  ADD CONSTRAINT "inbox_items_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "inbox_items_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
