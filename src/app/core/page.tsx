import dynamic from "next/dynamic";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

const Core = dynamic(() => import("./core"), {
  ssr: false,
});

export default async function Page() {
  return <Core chainId={DEFAULT_CHAIN_ID} />;
}
