# Email Notifications v2 — SES/SNS Console Runbook

The deploying IAM user (`tnrdd`) can only `ses:SendEmail`. Template and SNS
setup must be done in the AWS console (or with an elevated role).

- **Region:** `eu-south-1`
- **Configuration set:** `flow-council-tracking` (already exists; `SES_CONFIGURATION_SET`)
- **From identity:** `no-reply@flowstate.network`

## Variable contract (what the code injects per template)

`ses.ts` automatically merges `{{prefsLink}}` and `{{unsubscribeLink}}` into
**every** template's data. The body builders add the rest:

| Template | Variables |
|---|---|
| `flow-council-application-submitted` | `projectName`, `roundName`, `ctaLink`, `prefsLink`, `unsubscribeLink` |
| `flow-council-application-status` | `projectName`, `roundName`, `status`, `ctaLink`, `prefsLink`, `unsubscribeLink` |
| `flow-council-message` | `projectName`, `roundName`, `sender`, `messageContent`, `ctaLink`, `prefsLink`, `unsubscribeLink` |
| `flow-council-announcement` | `roundName`, `sender`, `messageContent`, `ctaLink`, `prefsLink`, `unsubscribeLink` |
| `flow-council-internal-comment` | `project_name`, `round_name`, `sender`, `message_content`, `ctaLink`, `prefsLink`, `unsubscribeLink` (⚠ snake_case) |
| `flow-state-platform-message` (NEW) | `subject`, `content`, `prefsLink`, `unsubscribeLink` |

## 1. Update the 5 existing templates (breaking change)

Pre-v2 templates referenced `{{unsubLink}}` (a single link to the application
page). v2 **no longer sends `unsubLink`** — it sends `{{prefsLink}}` (manage
preferences) and `{{unsubscribeLink}}` (unsubscribe-all). Every existing
template's footer must be edited to replace the `{{unsubLink}}` anchor with:

```html
<p style="font-size:12px;color:#888">
  <a href="{{prefsLink}}">Manage email preferences</a> &nbsp;·&nbsp;
  <a href="{{unsubscribeLink}}">Unsubscribe</a>
</p>
```

Leaving `{{unsubLink}}` in place renders an empty/broken link (SES leaves
unknown handlebars blank). Do this for all 5: `flow-council-application-submitted`,
`flow-council-application-status`, `flow-council-message`,
`flow-council-announcement`, `flow-council-internal-comment`.

Console: SES → Email templates → edit each. Or `aws sesv2 update-email-template`.

## 2. Create the new template `flow-state-platform-message`

`aws sesv2 create-email-template --cli-input-json file://flow-state-platform-message.json`
(region `eu-south-1`), with:

```json
{
  "TemplateName": "flow-state-platform-message",
  "TemplateContent": {
    "Subject": "{{subject}}",
    "Html": "<!DOCTYPE html><html><body style=\"font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px\"><h2 style=\"margin:0 0 16px\">{{subject}}</h2><div style=\"font-size:15px;line-height:1.6;white-space:pre-wrap\">{{content}}</div><hr style=\"border:none;border-top:1px solid #eee;margin:28px 0 12px\"><p style=\"font-size:12px;color:#888\"><a href=\"{{prefsLink}}\">Manage email preferences</a> &nbsp;·&nbsp; <a href=\"{{unsubscribeLink}}\">Unsubscribe</a></p></body></html>",
    "Text": "{{subject}}\n\n{{content}}\n\n---\nManage email preferences: {{prefsLink}}\nUnsubscribe: {{unsubscribeLink}}"
  }
}
```

(Match your existing templates' house style if you have one — the above is a
minimal, safe default.)

## 3. SNS topic + bounce/complaint subscription

The webhook (`/api/ses/sns-webhook`) suspends addresses on hard bounce /
complaint and self-confirms the SNS subscription.

1. **SNS → Create topic** (Standard), region `eu-south-1`, e.g. `ses-bounces-complaints`.
2. **SES → Configuration sets → `flow-council-tracking` → Event destinations →
   Add destination**:
   - Event types: **Bounce**, **Complaint** (Rejects/Delivery optional).
   - Destination: **Amazon SNS** → the topic above.
3. **SNS → the topic → Create subscription**:
   - Protocol: **HTTPS**
   - Endpoint: `https://<PROD_DOMAIN>/api/ses/sns-webhook`
     (replace `<PROD_DOMAIN>` with the public production domain — the same
     origin the app serves on; e.g. `app.flowstate.network`)
   - Leave "Enable raw message delivery" **OFF** (the handler expects the SNS
     envelope and validates its signature).
4. The endpoint auto-confirms `SubscriptionConfirmation` on first POST. Verify
   in SNS that the subscription state is **Confirmed**.
5. Test: SES → `flow-council-tracking` is fine; use the SES simulator address
   `bounce@simulator.amazonses.com` (hard bounce) and
   `complaint@simulator.amazonses.com` to confirm a `user_profiles` row gets
   `email_suspended_at` set.
