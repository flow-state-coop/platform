import { unstable_cache } from "next/cache";
import { getFlowStateMarkee } from "@/app/explore/lib/getFlowStateMarkee";

export const dynamic = "force-dynamic";

const getCachedMarkee = unstable_cache(getFlowStateMarkee, ["flow-state-markee"], {
  revalidate: 30,
});

export async function GET() {
  const markee = await getCachedMarkee();
  return Response.json({ markee });
}
