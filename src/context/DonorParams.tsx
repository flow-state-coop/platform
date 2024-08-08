import { useState, createContext, useContext } from "react";

type DonorParams = {
  strategyAddress: string | null;
  chainId: number | null;
  allocationToken: string | null;
  matchingToken: string | null;
  nftMintUrl: string | null;
};

export const DonorParamsContext = createContext<
  | (DonorParams & { updateDonorParams: (donorParams: DonorParams) => void })
  | null
>(null);

export function useDonorParamsContext() {
  const context = useContext(DonorParamsContext);

  if (!context) {
    throw Error("DonorParams context was not found");
  }

  return context;
}

export function DonorParamsContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [donorParams, setDonorParams] = useState<DonorParams>({
    strategyAddress: null,
    chainId: null,
    allocationToken: null,
    matchingToken: null,
    nftMintUrl: null,
  });

  return (
    <DonorParamsContext.Provider
      value={{
        ...donorParams,
        updateDonorParams: (donorParams: DonorParams) =>
          setDonorParams(donorParams),
      }}
    >
      {children}
    </DonorParamsContext.Provider>
  );
}
