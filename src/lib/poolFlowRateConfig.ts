export function getPoolFlowRateConfig(token: string) {
  switch (token) {
    case "ETHx":
      return {
        minAllocationPerMonth: 0.0004,
        flowRateScaling: BigInt(10),
      };
    case "ARBx":
      return {
        minAllocationPerMonth: 3,
        flowRateScaling: BigInt(1e6),
      };
    case "CELOx":
      return {
        minAllocationPerMonth: 3,
        flowRateScaling: BigInt(1e6),
      };
    case "DEGENx":
      return {
        minAllocationPerMonth: 500,
        flowRateScaling: BigInt(1e6),
      };
    case "HIGHERx":
      return {
        minAllocationPerMonth: 100,
        flowRateScaling: BigInt(1e6),
      };
    case "G$":
      return {
        minAllocationPerMonth: 10000,
        flowRateScaling: BigInt(1e6),
      };
    default:
      return {
        minAllocationPerMonth: 1,
        flowRateScaling: BigInt(1e6),
      };
  }
}
