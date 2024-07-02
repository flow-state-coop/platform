import { sqrtBigInt } from "@/lib/utils";

export function calcMatchingImpactEstimate({
  totalFlowRate,
  totalUnits,
  granteeUnits,
  granteeFlowRate,
  previousFlowRate,
  newFlowRate,
}: {
  totalUnits: bigint;
  totalFlowRate: bigint;
  granteeUnits: bigint;
  granteeFlowRate: bigint;
  previousFlowRate: bigint;
  newFlowRate: bigint;
}) {
  const scaledPreviousFlowRate = previousFlowRate / BigInt(1e6);
  const scaledNewFlowRate = newFlowRate / BigInt(1e6);
  const newGranteeUnitsSquared =
    sqrtBigInt(granteeUnits * BigInt(1e5)) -
    sqrtBigInt(BigInt(scaledPreviousFlowRate)) +
    sqrtBigInt(BigInt(scaledNewFlowRate));
  const newGranteeUnits =
    (newGranteeUnitsSquared * newGranteeUnitsSquared) / BigInt(1e5);
  const unitsDelta = newGranteeUnits - granteeUnits;
  const newPoolUnits = unitsDelta + totalUnits;
  const newGranteeFlowRate = newPoolUnits
    ? (newGranteeUnits * totalFlowRate) / newPoolUnits
    : BigInt(0);

  return newGranteeFlowRate - granteeFlowRate;
}
