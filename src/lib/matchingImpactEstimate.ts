import { sqrtBigInt } from "@/lib/utils";

export function calcMatchingImpactEstimate({
  totalFlowRate,
  totalUnits,
  granteeUnits,
  granteeFlowRate,
  previousFlowRate,
  newFlowRate,
  flowRateScaling,
}: {
  totalUnits: bigint;
  totalFlowRate: bigint;
  granteeUnits: bigint;
  granteeFlowRate: bigint;
  previousFlowRate: bigint;
  newFlowRate: bigint;
  flowRateScaling: bigint;
}) {
  const scaledPreviousFlowRate = previousFlowRate / flowRateScaling;
  const scaledNewFlowRate = newFlowRate / flowRateScaling;
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
