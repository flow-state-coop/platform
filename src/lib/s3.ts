import { S3Client } from "@aws-sdk/client-s3";

export const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export const S3_BUCKET = process.env.AWS_S3_BUCKET!;
export const S3_PUBLIC_URL = process.env.AWS_S3_PUBLIC_URL!; // e.g., https://bucket.s3.region.amazonaws.com or CloudFront URL
