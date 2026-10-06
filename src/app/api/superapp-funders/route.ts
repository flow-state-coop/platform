import { NextRequest } from "next/server";
import { fetchSplitterSenders } from "./senders";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chainId = Number(searchParams.get("chainId"));
  const splitter = searchParams.get("splitter") ?? "";
  const token = searchParams.get("token") ?? "";

  if (!Number.isInteger(chainId) || !splitter || !token) {
    return Response.json({ senders: [] }, { status: 400 });
  }

  return Response.json({
    senders: await fetchSplitterSenders(chainId, splitter, token),
  });
}
