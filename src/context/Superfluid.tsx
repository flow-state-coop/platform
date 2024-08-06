import { useEffect, useState, createContext, useContext } from "react";
import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import { providers } from "ethers";
import { Network } from "@/types/network";
import { Token } from "@/types/token";

export const SuperfluidContext = createContext<{
  sfFramework: Framework | null;
  matchingSuperToken: SuperToken | null;
  allocationSuperToken: SuperToken | null;
}>({ sfFramework: null, allocationSuperToken: null, matchingSuperToken: null });

export function useSuperfluidContext() {
  const context = useContext(SuperfluidContext);

  if (!context) {
    throw Error("Superfluid context was not found");
  }

  return context;
}

export default function SuperfluidContextProvider({
  network,
  allocationTokenInfo,
  matchingTokenInfo,
  children,
}: {
  network?: Network;
  allocationTokenInfo: Token;
  matchingTokenInfo: Token;
  children: React.ReactNode;
}) {
  const [sfFramework, setSfFramework] = useState<Framework | null>(null);
  const [matchingSuperToken, setMatchingSuperToken] =
    useState<SuperToken | null>(null);
  const [allocationSuperToken, setAllocationSuperToken] =
    useState<SuperToken | null>(null);

  useEffect(() => {
    (async () => {
      if (network && matchingTokenInfo.address && allocationTokenInfo.address) {
        try {
          const ethersProvider = new providers.JsonRpcProvider(network.rpcUrl, {
            chainId: network.id,
            name: network.name,
          });
          const sfFramework = await Framework.create({
            chainId: network.id,
            resolverAddress: network.superfluidResolver,
            provider: ethersProvider,
          });
          const matchingSuperToken = await sfFramework.loadSuperToken(
            matchingTokenInfo.address,
          );
          const allocationSuperToken = await sfFramework.loadSuperToken(
            allocationTokenInfo.address,
          );

          setSfFramework(sfFramework);
          setMatchingSuperToken(matchingSuperToken);
          setAllocationSuperToken(allocationSuperToken);
        } catch (err) {
          console.error(err);
        }
      }
    })();
  }, [network, matchingTokenInfo, allocationTokenInfo]);

  return (
    <SuperfluidContext.Provider
      value={{
        sfFramework,
        allocationSuperToken,
        matchingSuperToken,
      }}
    >
      {children}
    </SuperfluidContext.Provider>
  );
}
