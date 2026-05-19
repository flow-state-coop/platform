import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

// SESv2 (not v1) because only SendEmailCommand lets us attach custom MIME
// headers (List-Unsubscribe) to a template-rendered send. v1's
// SendTemplatedEmailCommand has no header support.
export const sesClient = new SESv2Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export const SES_FROM_EMAIL =
  process.env.SES_FROM_EMAIL || "no-reply@flowstate.network";

export const SES_CONFIGURATION_SET = process.env.SES_CONFIGURATION_SET;

export type PersonalizedRecipient = {
  email: string;
  address: string;
  // Single per-recipient notification token. The preferences page and the
  // unsubscribe links (in-page + RFC 8058 one-click) all validate against
  // the same email_version-derived token, so they cannot diverge.
  token: string;
};

export function buildPrefsLink(
  baseUrl: string,
  address: string,
  token: string,
): string {
  return `${baseUrl}/preferences?address=${encodeURIComponent(address)}&token=${encodeURIComponent(token)}`;
}

export function buildUnsubscribeLink(
  baseUrl: string,
  address: string,
  token: string,
): string {
  return `${baseUrl}/preferences?address=${encodeURIComponent(address)}&token=${encodeURIComponent(token)}&action=unsubscribe`;
}

// RFC 8058 one-click target. Mail clients POST here server-to-server (no
// browser), so it's immune to the prefetch/scanner footgun that the
// in-page confirmation card guards against for the body link.
export function buildOneClickUnsubscribeLink(
  baseUrl: string,
  address: string,
  token: string,
): string {
  return `${baseUrl}/api/flow-council/preferences/unsubscribe/one-click?address=${encodeURIComponent(address)}&token=${encodeURIComponent(token)}`;
}

export async function sendPersonalizedEmail(
  recipient: PersonalizedRecipient,
  templateName: string,
  templateData: Record<string, string>,
  baseUrl: string,
): Promise<void> {
  const data = {
    ...templateData,
    prefsLink: buildPrefsLink(baseUrl, recipient.address, recipient.token),
    unsubscribeLink: buildUnsubscribeLink(
      baseUrl,
      recipient.address,
      recipient.token,
    ),
  };

  const oneClickLink = buildOneClickUnsubscribeLink(
    baseUrl,
    recipient.address,
    recipient.token,
  );

  const command = new SendEmailCommand({
    FromEmailAddress: SES_FROM_EMAIL,
    Destination: {
      ToAddresses: [recipient.email],
    },
    Content: {
      Template: {
        TemplateName: templateName,
        TemplateData: JSON.stringify(data),
        Headers: [
          { Name: "List-Unsubscribe", Value: `<${oneClickLink}>` },
          {
            Name: "List-Unsubscribe-Post",
            Value: "List-Unsubscribe=One-Click",
          },
        ],
      },
    },
    ...(SES_CONFIGURATION_SET && {
      ConfigurationSetName: SES_CONFIGURATION_SET,
    }),
  });

  await sesClient.send(command);
}
