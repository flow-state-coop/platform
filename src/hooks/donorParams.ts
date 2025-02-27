import { useDonorParamsContext } from "@/context/DonorParams";

export default function useDonorParams() {
  const {
    poolId,
    strategyAddress,
    gdaPoolAddress,
    chainId,
    allocationToken,
    matchingToken,
    updateDonorParams,
    nftMintUrl,
  } = useDonorParamsContext();

  return {
    poolId,
    strategyAddress,
    gdaPoolAddress,
    chainId,
    allocationToken,
    matchingToken,
    updateDonorParams,
    nftMintUrl,
  };
}
