import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("../s3", () => ({
  s3Client: {},
  S3_BUCKET: "test-bucket",
  S3_PUBLIC_URL: "https://cdn.test",
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://signed.example.com/put"),
}));

import { POST } from "./route";
import { mockSession } from "@tests/helpers/session";

const UPLOADER_ADDRESS = "0xAbCd1111111111111111111111111111111111cD";

async function readJson(res: Response) {
  return JSON.parse(await res.text());
}

function presignRequest(body: unknown) {
  return new Request("http://localhost/api/flow-council/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Spec (.claude/specs/social-share-tab.md): "Admin uploads a share image
// (PNG, JPEG, or WebP only — SVG explicitly rejected; max 1MB)". The 1MB cap
// applies to the share-image upload kind only; other upload callers keep the
// existing 5MB cap. Impl plan task 4: share-image keys use a
// share-images/<address>/<Date.now()>.<ext> prefix so every upload gets a
// new versioned URL.
describe("POST /api/flow-council/images", () => {
  beforeEach(() => {
    mockSession(UPLOADER_ADDRESS);
  });

  describe('kind: "share-image"', () => {
    it("rejects a share-image presign for a 1.5MB file with the 1MB cap message", async () => {
      const res = await POST(
        presignRequest({
          fileName: "share.png",
          contentType: "image/png",
          fileSize: 1_500_000,
          kind: "share-image",
        }),
      );
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body.success).toBe(false);
      expect(body.error).toBe("File too large. Max 1MB");
    });

    it("accepts a share-image presign for an 800KB file", async () => {
      const res = await POST(
        presignRequest({
          fileName: "share.png",
          contentType: "image/png",
          fileSize: 800_000,
          kind: "share-image",
        }),
      );
      const body = await readJson(res);
      expect(body.success).toBe(true);
    });

    it("generates share-image keys under a share-images/<address>/ prefix with a versioned name", async () => {
      const res = await POST(
        presignRequest({
          fileName: "share.png",
          contentType: "image/png",
          fileSize: 800_000,
          kind: "share-image",
        }),
      );
      const body = await readJson(res);
      expect(body.success).toBe(true);
      expect(body.key).toMatch(
        new RegExp(
          `^share-images/${UPLOADER_ADDRESS.toLowerCase()}/\\d+\\.png$`,
        ),
      );
      expect(body.publicUrl).toBe(`https://cdn.test/${body.key}`);
    });

    it("rejects an SVG share-image upload", async () => {
      const res = await POST(
        presignRequest({
          fileName: "share.svg",
          contentType: "image/svg+xml",
          fileSize: 10_000,
          kind: "share-image",
        }),
      );
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body.success).toBe(false);
    });
  });

  describe("plain uploads (no kind) are unaffected", () => {
    it("allows a plain presign for the same 1.5MB file (5MB cap applies)", async () => {
      const res = await POST(
        presignRequest({
          fileName: "logo.png",
          contentType: "image/png",
          fileSize: 1_500_000,
        }),
      );
      const body = await readJson(res);
      expect(body.success).toBe(true);
    });

    it("keeps the projects/<address>/ key prefix for plain uploads", async () => {
      const res = await POST(
        presignRequest({
          fileName: "logo.png",
          contentType: "image/png",
          fileSize: 1_500_000,
        }),
      );
      const body = await readJson(res);
      expect(body.success).toBe(true);
      expect(body.key).toMatch(
        new RegExp(`^projects/${UPLOADER_ADDRESS.toLowerCase()}/\\d+\\.png$`),
      );
    });
  });
});
