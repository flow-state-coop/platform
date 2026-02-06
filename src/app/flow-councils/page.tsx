import FlowCouncils from "./flow-councils";
import { networks } from "@/lib/networks";

const network = networks.find((network) => network.label === "celo")!;

export default async function Page() {
  return <FlowCouncils defaultNetwork={network} />;
}
