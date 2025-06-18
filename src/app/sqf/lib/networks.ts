import { networks as baseNetworks } from "@/lib/networks";
import { Network } from "@/types/network";

const networks: Network[] = baseNetworks.map((baseNetwork) => {
  if (baseNetwork.id === 8453) {
    return {
      ...baseNetwork,
      tokens: baseNetwork.tokens
        .concat({
          symbol: "MPULSEx",
          address: "0xBa86154ccFA1E2d4AB7b6320ba17FeD8c665B365",
          icon: "/lunco.svg",
        })
        .sort((a, b) => a.symbol.localeCompare(b.symbol, "en")),
    };
  }

  return baseNetwork;
});

export { networks };
