export function getPoolFlowRateConfig(token: string) {
  switch (token) {
    case "ETHx":
      return { minAllocationPerMonth: 0.004, flowRateScaling: BigInt(10) };
    default:
      return { minAllocationPerMonth: 1, flowRateScaling: BigInt(1e6) };
  }
}
