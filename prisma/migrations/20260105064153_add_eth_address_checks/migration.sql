-- AddCheck for lowercase ethereum addresses
ALTER TABLE "round_admins" ADD CONSTRAINT "valid_admin_address" CHECK ("admin_address" ~ '^0x[a-f0-9]{40}$');

ALTER TABLE "applications" ADD CONSTRAINT "valid_funding_address" CHECK ("funding_address" ~ '^0x[a-f0-9]{40}$');

ALTER TABLE "grantee_managers" ADD CONSTRAINT "valid_manager_address" CHECK ("manager_address" ~ '^0x[a-f0-9]{40}$');

ALTER TABLE "comments" ADD CONSTRAINT "valid_author_address" CHECK ("author_address" ~ '^0x[a-f0-9]{40}$');
