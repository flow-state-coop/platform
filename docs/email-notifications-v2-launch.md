# Email Notifications v2 — Launch Runbook

Operator guide for deploying the user-controlled notification preferences feature.
All steps must be executed in the order shown. Do not deploy code before completing steps 1–4.

---

## 1. Pre-deploy checklist

### DB migration

- [ ] Run `pnpm prisma migrate deploy` against the target DB.
- [ ] Migration `20260513000000_email_notifications_v2` adds 10 columns to `user_profiles`, creates the `inbox_items` table, and adds a partial UNIQUE index on `user_profiles.email WHERE email IS NOT NULL`.
- [ ] Confirm the partial unique index applied cleanly. If it fails, there are duplicate non-null emails in the table — find and resolve them before proceeding.

### Env vars (Vercel)

Add both secrets to Vercel before deploying. They are required at startup; missing either will cause the relevant endpoints to return 401/500.

| Variable | How to generate |
|---|---|
| `NOTIFICATION_HMAC_SECRET` | `openssl rand -hex 32` |
| `PLATFORM_MESSAGE_SECRET` | `openssl rand -hex 32` |

Use separate values — do not reuse `NEXTAUTH_SECRET` or each other.

### SES templates — update existing (5 templates)

All five existing templates must have `{{prefsLink}}` and `{{unsubscribeLink}}` variables added **before** code is deployed. If the code deploys first, outgoing emails will contain unrendered `{{...}}` placeholders.

Templates to update in AWS SES console:

- `flow-council-application-submitted`
- `flow-council-application-status`
- `flow-council-message`
- `flow-council-announcement`
- `flow-council-internal-comment`

### SES templates — create new (2 templates)

| Template name | Used by |
|---|---|
| `goodbuilders-milestone-reminder` | Milestone reminder cron |
| `flow-state-platform-message` | `POST /api/flow-council/platform-message` |

Both templates must include `{{prefsLink}}` and `{{unsubscribeLink}}` variables. Send a test email from the SES console after creation to verify variable substitution renders without errors.

### Scripts — have ready, do not run yet

- `scripts/pre-launch-audit.ts` — run after migration, before code deploy.
- `scripts/migrate-project-emails.ts` — optional backfill, run after audit.

---

## 2. Deploy order

**Step 1 — Apply DB migration**

```
pnpm prisma migrate deploy
```

Schema is additive. All new columns have defaults. No existing query breaks.

**Step 2 — Provision env vars in Vercel**

Set `NOTIFICATION_HMAC_SECRET` and `PLATFORM_MESSAGE_SECRET` in the Vercel dashboard for each target environment (staging, production). Do this before the deploy so the values are available on first request.

**Step 3 — Update existing SES templates**

In the AWS SES console, open each of the 5 templates listed above and add `{{prefsLink}}` and `{{unsubscribeLink}}` to the HTML and text bodies. Save and send a test.

**Step 4 — Create new SES templates**

Create `goodbuilders-milestone-reminder` and `flow-state-platform-message` in the SES console. Include the two link variables. Test each.

**Step 5 — Deploy code**

The SNS webhook endpoint (`/api/ses/sns-webhook`) is now live. It will handle `SubscriptionConfirmation` automatically. No SNS subscription exists yet, so no real bounce events arrive.

**Step 6 — Wire up SNS bounce/complaint pipeline**

Do this per environment (repeat for staging and production with the correct host):

1. Create an SNS topic: `flow-state-ses-bounces-<env>` (e.g. `flow-state-ses-bounces-prod`).
2. In SES console, open the `flow-council-tracking` configuration set. Under **Event destinations**, add an SNS destination for `Bounce` and `Complaint` event types, pointing to the new topic ARN.
3. In the SNS console, create an HTTPS subscription on the topic with endpoint `https://<env-host>/api/ses/sns-webhook`.
4. SNS immediately sends a `SubscriptionConfirmation` POST to the webhook. The webhook will fetch the `SubscribeURL` automatically. Within 30–60 seconds the subscription status should change to **Confirmed** in the SNS console. Verify before proceeding.

**Step 7 — Run pre-launch audit**

```
pnpm tsx scripts/pre-launch-audit.ts
```

Review the three output counts:

- **Orphan project_emails (manager_address NULL)**: users who cannot be migrated and will stop receiving notifications. Target for comms outreach.
- **round_admin_emails whose admin wallet has no profile**: admins who will silently stop receiving notifications. Target for comms outreach.
- **Users with email but no consent (will see first-login modal)**: expected to be non-zero; no action needed.

**Step 8 — Optionally run email backfill**

```
pnpm tsx scripts/migrate-project-emails.ts
```

Copies emails from `project_emails` to `user_profiles.email` for wallets that have a profile but no email. Does **not** set consent. Pre-populated emails remain inert until the user completes the first-login consent modal. Review the conflict log output — any wallet with multiple distinct emails in `project_emails` is skipped and printed.

**Step 9 — Pre-launch comms**

Before flipping the feature live, notify affected users:

- Round admins whose email lives only in `round_admin_emails` (no profile): they must add an email to their Profile to keep receiving notifications.
- Project managers with orphaned `project_emails` rows (no `manager_address`): same message.

---

## 3. Post-deploy verification

### Preferences link works

1. Trigger any notification email to a test account (e.g. submit an application on a test round).
2. Open the received email. Click **Manage preferences**.
3. Confirm the `/preferences?token=...` page loads without SIWE, shows the 5 category toggles, and reflects the account's current preferences.
4. Toggle one category off. Reload the page (using the same link). Confirm the change persisted.

### Hard-bounce updates a profile

1. In the AWS SES console (sandbox or via a verified identity), trigger a simulator bounce to the address `bounce@simulator.amazonses.com` from a test send, or use the SNS console to **Publish message** directly to the `flow-state-ses-bounces-<env>` topic with a synthetic SES bounce payload.
2. A minimal synthetic hard-bounce payload to publish:
   ```json
   {
     "eventType": "Bounce",
     "bounce": {
       "bounceType": "Permanent",
       "bouncedRecipients": [{ "emailAddress": "<test-profile-email>" }]
     }
   }
   ```
   Note: publishing directly from the SNS console bypasses SNS signature verification. For a true end-to-end test, send via SES to the simulator address.
3. Query `user_profiles WHERE email = '<test-profile-email>'`. Confirm `email_suspended_at` is now non-null and `email_suspension_reason = 'hard_bounce'`.
4. Confirm the Profile page shows the suspension warning banner for that user.

### Consent modal appears for existing-email users

1. Sign in with a wallet that has a profile email but `consent_confirmed_at IS NULL`.
2. Confirm the consent modal appears immediately on login.
3. Dismiss with "Remind me later". Confirm no email fires for that user when a notification event occurs.
4. Sign in again. Confirm the modal re-appears.
5. Complete consent. Confirm the modal does not appear on subsequent logins and that `consent_confirmed_at` is now set in the DB.

---

## 4. Rollback notes

The DB changes are **fully additive**: new columns (all with defaults or nullable), a new table, and a partial index. Rolling back the code deployment returns the app to v1 behavior without any migration undo.

- `user_profiles` new columns: no existing queries break on rollback; all new columns are ignored by v1 code.
- `inbox_items`: orphaned rows accumulate if rollback is prolonged, but cause no harm. Drop the table only after confirming rollback is permanent.
- Partial UNIQUE index on `user_profiles.email`: safe to leave in place during rollback.

**To roll back**: redeploy the previous Vercel deployment. No DB rollback is necessary or recommended.

If you need to re-run the migration from a clean state in a non-production environment: `pnpm prisma migrate reset` (destructive — never run against production).

---

## 5. Operational gotchas

**SES send rate limit**
The default SES quota is ~14 sends/sec. A fan-out to 100 recipients takes approximately 7 seconds fire-and-forget. For platform-wide messages to large opted-in populations, verify the account's sending limit in the SES console before launch. If the limit is tight, request an increase before the first platform-message send.

**SNS subscription confirmation chicken-and-egg**
The HTTPS subscription cannot be confirmed until the webhook is live and reachable. Sequence is: deploy code → create HTTPS subscription → webhook auto-confirms. If you create the subscription before deploying, it will expire unconfirmed (SNS times out after 3 days). The webhook handles `SubscriptionConfirmation` and `UnsubscribeConfirmation` types on the same `POST` handler, so there is no separate stub-deploy step needed — a single deploy handles both phases.

**SNS signature verification cannot be skipped**
The `/api/ses/sns-webhook` endpoint accepts unauthenticated traffic. Without signature verification, anyone with the URL can forge bounce events and suspend arbitrary users' emails. The implementation uses `sns-validator` which also restricts `SigningCertURL` to `https://sns.<region>.amazonaws.com(.cn)?` to prevent SSRF via a forged certificate URL. Do not weaken or bypass this check.

**SubscribeURL host validation**
Even after SNS signature verification passes, the webhook validates the `SubscribeURL` hostname against the same `sns.<region>.amazonaws.com` pattern before fetching it. A verified payload with an attacker-controlled `SubscribeURL` could otherwise direct the server to fetch internal endpoints (e.g. instance metadata). This check is in the code and must not be removed.

**SES template variables must precede code deploy**
If code ships before the SES templates are updated with `{{prefsLink}}` and `{{unsubscribeLink}}`, outgoing emails will contain unrendered placeholder text. Update templates first.

**Consent gate is centralized**
Every email send goes through the recipient-resolution function, which enforces `consent_confirmed_at IS NOT NULL AND email_suspended_at IS NULL`. There is no per-call-site consent check. If you add a new email trigger in the future, route it through the same resolution helpers — do not call SES directly.

**HMAC token invalidation**
Unsubscribe and preferences tokens are tied to `email_version` on `user_profiles`. Changing the profile email increments `email_version`, invalidating all previously issued tokens. If a user reports that their preferences/unsubscribe link no longer works, it is because they changed their email — they should use the new link from a more recent email.

**`project_emails` and `round_admin_emails` tables are not dropped**
Both tables remain in the DB post-launch as read-only historical data. They are no longer used for recipient resolution. Dropping them is a separate future decision.

**Round admins without profiles**
Admin wallets that have no `user_profiles` row cannot receive notifications under v2. The recipient-resolution left join returns no email for them and they are silently skipped. This is intentional and must be communicated pre-launch.

**Consent version stored but not yet acted upon**
`consent_version` is recorded as `"2026-05-13"` (hardcoded in `src/lib/consent.ts`). The re-prompt UX for future consent version bumps is deferred from v2. When the consent text changes in the future, update `CONSENT_VERSION` in `consent.ts` and add the re-prompt logic at that time.
