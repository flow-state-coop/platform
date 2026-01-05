import { getServerSession } from "next-auth/next";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { authOptions } from "../../auth/[...nextauth]/route";
import { s3Client, S3_BUCKET, S3_PUBLIC_URL } from "@/lib/s3";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
        { status: 401 },
      );
    }

    const { fileName, contentType, fileSize } = await request.json();

    if (!fileName || !contentType) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing fileName or contentType",
        }),
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid file type. Allowed: PNG, JPEG, WebP",
        }),
        { status: 400 },
      );
    }

    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ success: false, error: "File too large. Max 5MB" }),
        { status: 400 },
      );
    }

    const ext = fileName.split(".").pop()?.toLowerCase() || "png";
    const key = `projects/${session.address.toLowerCase()}/${Date.now()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 minutes
    const publicUrl = `${S3_PUBLIC_URL}/${key}`;

    return new Response(
      JSON.stringify({
        success: true,
        uploadUrl,
        publicUrl,
        key,
      }),
    );
  } catch (err) {
    console.error("Failed to generate presigned URL:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to generate upload URL",
      }),
      { status: 500 },
    );
  }
}
