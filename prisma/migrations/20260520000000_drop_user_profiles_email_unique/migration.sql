-- Drop the partial unique index on user_profiles.email.
-- Multiple wallet addresses are allowed to share an email; the SES bounce
-- handler already suspends every row matching a bounced address.
DROP INDEX IF EXISTS "user_profiles_email_unique";
