import { config } from "dotenv";
import { fileURLToPath, URL } from "node:url";

config({
  path: fileURLToPath(new URL("../../.env.test.local", import.meta.url)),
  quiet: true,
});

process.env.AWS_S3_PUBLIC_URL ??= "https://cdn.test";
