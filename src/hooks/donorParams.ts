import { useDonorParamsContext } from "@/context/DonorParams";

export default function useDonorParams() {
  const {
    strategyAddress,
    chainId,
    allocationToken,
    matchingToken,
    updateDonorParams,
    nftMintUrl,
  } = useDonorParamsContext();

  return {
    strategyAddress,
    chainId,
    allocationToken,
    matchingToken,
    updateDonorParams,
    nftMintUrl,
  };
}
