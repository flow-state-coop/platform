import { SendTemplatedEmailCommand, SESClient } from "@aws-sdk/client-ses";

export const sesClient = new SESClient({
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
  unsubToken: string;
  prefsToken: string;
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

export async function sendPersonalizedEmail(
  recipient: PersonalizedRecipient,
  templateName: string,
  templateData: Record<string, string>,
  baseUrl: string,
): Promise<void> {
  const data = {
    ...templateData,
    prefsLink: buildPrefsLink(baseUrl, recipient.address, recipient.prefsToken),
    unsubscribeLink: buildUnsubscribeLink(
      baseUrl,
      recipient.address,
      recipient.unsubToken,
    ),
  };

  const command = new SendTemplatedEmailCommand({
    Source: SES_FROM_EMAIL,
    Destination: {
      ToAddresses: [recipient.email],
    },
    Template: templateName,
    TemplateData: JSON.stringify(data),
    ...(SES_CONFIGURATION_SET && {
      ConfigurationSetName: SES_CONFIGURATION_SET,
    }),
  });

  await sesClient.send(command);
}
