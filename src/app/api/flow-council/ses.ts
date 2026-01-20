import { SESClient } from "@aws-sdk/client-ses";

export const sesClient = new SESClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export const SES_FROM_EMAIL =
  process.env.SES_FROM_EMAIL || "no-reply@flowstate.network";
