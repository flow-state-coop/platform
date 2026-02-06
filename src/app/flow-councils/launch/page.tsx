import Launch from "./launch";
import { networks } from "@/lib/networks";

const network = networks.find((network) => network.label === "celo")!;

export default async function Page() {
  return <Launch defaultNetwork={network} />;
}
