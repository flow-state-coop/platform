import { getFlowStateMarkee } from "@/app/explore/lib/getFlowStateMarkee";

export const dynamic = "force-dynamic";

export async function GET() {
  const markee = await getFlowStateMarkee();
  return Response.json({ markee });
}
