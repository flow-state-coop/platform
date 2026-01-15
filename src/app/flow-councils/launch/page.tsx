import Launch from "./launch";
import { networks } from "@/lib/networks";

export default async function Page() {
  return <Launch defaultNetwork={networks[0]} />;
}
