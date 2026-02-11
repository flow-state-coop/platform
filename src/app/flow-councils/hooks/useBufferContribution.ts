import { useMemo } from "react";
import { Address, parseAbi } from "viem";
import { useReadContract } from "wagmi";
import { Network } from "@/types/network";

const CFAV1_PPP_CONFIG_KEY =
  "0xb1e88cb86e1fa4de09c90e44e1bdf81ae6203e485f69963c6f1992f86a59db14" as `0x${string}`;

export default function useBufferContribution(
  network: Network,
  splitterAddress: string | null,
  distributionTokenAddress: Address,
  newFlowRate: string,
  flowRateToReceiver: string,
  totalInflowRate: string,
): bigint {
  const { data: governanceAddress } = useReadContract({
    address: network.superfluidHost,
    abi: parseAbi(["function getGovernance() view returns (address)"]),
    functionName: "getGovernance",
    chainId: network.id,
  });
  const { data: minimumDeposit } = useReadContract({
    address: governanceAddress as Address | undefined,
    abi: parseAbi([
      "function getSuperTokenMinimumDeposit(address host, address superToken) view returns (uint256)",
    ]),
    functionName: "getSuperTokenMinimumDeposit",
    args: [network.superfluidHost, distributionTokenAddress],
    chainId: network.id,
    query: { enabled: !!governanceAddress },
  });
  const { data: pppConfigValue } = useReadContract({
    address: governanceAddress as Address | undefined,
    abi: parseAbi([
      "function getConfigAsUint256(address host, address superToken, bytes32 key) view returns (uint256)",
    ]),
    functionName: "getConfigAsUint256",
    args: [
      network.superfluidHost,
      distributionTokenAddress,
      CFAV1_PPP_CONFIG_KEY,
    ],
    chainId: network.id,
    query: { enabled: !!governanceAddress },
  });
  const liquidationPeriod = pppConfigValue
    ? (pppConfigValue >> 32n) & 0xffffffffn
    : 0n;
  const { data: sideRecipientPortion } = useReadContract({
    address: splitterAddress as Address | undefined,
    abi: parseAbi(["function SIDE_RECIPIENT_PORTION() view returns (int96)"]),
    functionName: "SIDE_RECIPIENT_PORTION",
    chainId: network.id,
    query: { enabled: !!splitterAddress },
  });

  return useMemo(() => {
    if (
      !splitterAddress ||
      !minimumDeposit ||
      !liquidationPeriod ||
      sideRecipientPortion === undefined ||
      sideRecipientPortion === null
    ) {
      return 0n;
    }

    const bufferForRate = (rate: bigint) =>
      rate > 0n
        ? rate * liquidationPeriod > minimumDeposit
          ? rate * liquidationPeriod
          : minimumDeposit
        : 0n;

    const userDelta = BigInt(newFlowRate) - BigInt(flowRateToReceiver);
    const oldTotal = BigInt(totalInflowRate);
    const newTotal = oldTotal + userDelta;

    const sidePortion = BigInt(sideRecipientPortion);
    const mainPortion = 1000n - sidePortion;

    const oldBuffer =
      bufferForRate((oldTotal * mainPortion) / 1000n) +
      bufferForRate((oldTotal * sidePortion) / 1000n);
    const newBuffer =
      bufferForRate((newTotal * mainPortion) / 1000n) +
      bufferForRate((newTotal * sidePortion) / 1000n);

    const delta = newBuffer - oldBuffer;
    return delta > 0n ? delta : 0n;
  }, [
    splitterAddress,
    minimumDeposit,
    liquidationPeriod,
    sideRecipientPortion,
    newFlowRate,
    flowRateToReceiver,
    totalInflowRate,
  ]);
}
