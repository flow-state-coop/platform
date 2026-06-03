/**
 * Migrate the Flow Council SES email templates to render markdown bodies.
 *
 * The message-body variables were previously emitted with Handlebars'
 * HTML-escaping double braces ({{...}}), so markdown reached recipients as
 * literal characters. This rewrites each template body to raw output
 * ({{{...Html}}}) inside a <div>, matching the sanitized HTML now produced by
 * renderMarkdownToHtml() (src/app/api/flow-council/markdown.ts) and sent from
 * email.ts. Templates with a plain-text part keep their original {{...}} text
 * variable so the text alternative stays tag-free.
 *
 * Usage:
 *   tsx scripts/migrate-email-templates-markdown.ts --dry-run   # preview only
 *   tsx scripts/migrate-email-templates-markdown.ts             # apply (live SES)
 *
 * Reads AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY from the
 * environment (falling back to .env). Credentials need ses:GetEmailTemplate
 * and ses:UpdateEmailTemplate. Idempotent — already-migrated templates are
 * skipped. Each original body is backed up under the OS temp dir before its
 * update, so the change is revertible.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SESv2Client,
  GetEmailTemplateCommand,
  UpdateEmailTemplateCommand,
} from "@aws-sdk/client-sesv2";

// Fall back to .env so the script behaves like the app when run locally.
function loadEnvFallback(): void {
  if (process.env.AWS_ACCESS_KEY_ID) return;
  try {
    const txt = readFileSync(".env", "utf8");
    for (const raw of txt.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* no .env — rely on the real environment */
  }
}
loadEnvFallback();

type Migration = {
  template: string;
  // Matches the current escaped body so we transform exactly that node.
  find: RegExp;
  // Raw-output replacement wrapped in a block-level <div>.
  replace: string;
  // Presence of this string means the template is already migrated.
  doneMarker: string;
};

const MIGRATIONS: Migration[] = [
  {
    template: "flow-council-message",
    find: /<p style="margin:0 0 8px 0;">\s*\{\{messageContent\}\}\s*<\/p>/,
    replace: '<div style="margin:0 0 8px 0;">{{{messageContentHtml}}}</div>',
    doneMarker: "{{{messageContentHtml}}}",
  },
  {
    template: "flow-council-announcement",
    find: /<p style="margin:0 0 8px 0;">\s*\{\{messageContent\}\}\s*<\/p>/,
    replace: '<div style="margin:0 0 8px 0;">{{{messageContentHtml}}}</div>',
    doneMarker: "{{{messageContentHtml}}}",
  },
  {
    template: "flow-council-internal-comment",
    find: /<p style="margin:0 0 8px 0;">\s*\{\{message_content\}\}\s*<\/p>/,
    replace: '<div style="margin:0 0 8px 0;">{{{message_content_html}}}</div>',
    doneMarker: "{{{message_content_html}}}",
  },
  {
    template: "flow-state-platform-message",
    find: /<div style="font-size:15px;line-height:1\.6;white-space:pre-wrap">\{\{content\}\}<\/div>/,
    replace:
      '<div style="font-size:15px;line-height:1.6">{{{content_html}}}</div>',
    doneMarker: "{{{content_html}}}",
  },
];

const dryRun = process.argv.includes("--dry-run");

const client = new SESv2Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
});

const backupDir = join(tmpdir(), `ses-template-backups-${Date.now()}`);

async function run(): Promise<void> {
  if (!dryRun) mkdirSync(backupDir, { recursive: true });
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const m of MIGRATIONS) {
    try {
      const cur = await client.send(
        new GetEmailTemplateCommand({ TemplateName: m.template }),
      );
      const html = cur.TemplateContent?.Html ?? "";

      if (html.includes(m.doneMarker)) {
        console.log(`• ${m.template}: already migrated — skipping`);
        skipped++;
        continue;
      }

      const newHtml = html.replace(m.find, m.replace);
      if (newHtml === html) {
        console.error(
          `✗ ${m.template}: body pattern not found — skipping (needs manual review)`,
        );
        failed++;
        continue;
      }

      if (dryRun) {
        console.log(`• ${m.template}: would set body -> ${m.replace}`);
        continue;
      }

      writeFileSync(join(backupDir, `${m.template}.html`), html);
      await client.send(
        new UpdateEmailTemplateCommand({
          TemplateName: m.template,
          TemplateContent: {
            Subject: cur.TemplateContent?.Subject,
            Html: newHtml,
            Text: cur.TemplateContent?.Text,
          },
        }),
      );
      console.log(`✓ ${m.template}: updated`);
      updated++;
    } catch (err) {
      console.error(
        `✗ ${m.template}: ${(err as Error).name}: ${(err as Error).message}`,
      );
      failed++;
    }
  }

  console.log(
    `\n${dryRun ? "[dry-run] " : ""}done — updated:${updated} skipped:${skipped} failed:${failed}`,
  );
  if (!dryRun && updated > 0) {
    console.log(`originals backed up to: ${backupDir}`);
  }
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
