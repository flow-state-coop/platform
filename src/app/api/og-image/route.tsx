import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { OG_DEFAULT_IMAGE_URL } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const cid = searchParams.get("cid");

  let imageUri = "";

  try {
    const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
    const buffer = await res.arrayBuffer();
    const png = await sharp(buffer).toFormat("png").toBuffer();

    imageUri = `data:${"image/png"};base64,${png.toString("base64")}`;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error(err);
    }
  }

  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUri ? imageUri : OG_DEFAULT_IMAGE_URL} alt="" />
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
