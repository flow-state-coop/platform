import { cookies as nextCookies } from "next/headers";
import Launch from "./launch";
import { networks } from "@/lib/networks";

const network = networks.find((network) => network.label === "celo")!;

export default async function Page() {
  const cookies = await nextCookies();

  return (
    <Launch
      defaultNetwork={network}
      csrfToken={cookies.get("next-auth.csrf-token")?.value.split("|")[0] ?? ""}
    />
  );
}
