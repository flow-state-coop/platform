import { getServerSession } from "next-auth/next";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { authOptions } from "../../auth/[...nextauth]/route";
import { s3Client, S3_BUCKET, S3_PUBLIC_URL } from "../s3";
import { ALLOWED_IMAGE_TYPES } from "@/app/flow-councils/lib/constants";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_SHARE_IMAGE_FILE_SIZE = 1024 * 1024; // 1MB

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
        { status: 401 },
      );
    }

    const { fileName, contentType, fileSize, kind } = await request.json();
    const isShareImage = kind === "share-image";

    if (!fileName || !contentType) {
      console.warn("Rejected image upload: missing fileName or contentType", {
        fileName,
        contentType,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing fileName or contentType",
        }),
        { status: 400 },
      );
    }

    if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
      console.warn("Rejected image upload: invalid file type", {
        fileName,
        contentType,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid file type. Allowed: PNG, JPEG, WebP",
        }),
        { status: 400 },
      );
    }

    const maxFileSize = isShareImage
      ? MAX_SHARE_IMAGE_FILE_SIZE
      : MAX_FILE_SIZE;

    if (fileSize && fileSize > maxFileSize) {
      console.warn("Rejected image upload: file too large", {
        fileName,
        contentType,
        fileSize,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: isShareImage
            ? "File too large. Max 1MB"
            : "File too large. Max 5MB",
        }),
        { status: 400 },
      );
    }

    const ext = fileName.split(".").pop()?.toLowerCase() || "png";
    const keyPrefix = isShareImage ? "share-images" : "projects";
    const key = `${keyPrefix}/${session.address.toLowerCase()}/${Date.now()}.${ext}`;

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
