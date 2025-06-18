export function getPoolFlowRateConfig(token: string) {
  switch (token) {
    case "ETHx":
      return {
        minAllocationPerMonth: 0.0004,
        flowRateScaling: BigInt(10),
        suggestedFlowStateDonation: 0.001,
      };
    case "ARBx":
      return {
        minAllocationPerMonth: 3,
        flowRateScaling: BigInt(1e6),
        suggestedFlowStateDonation: 5,
      };
    case "CELOx":
      return {
        minAllocationPerMonth: 3,
        flowRateScaling: BigInt(1e6),
        suggestedFlowStateDonation: 5,
      };
    case "DEGENx":
      return {
        minAllocationPerMonth: 500,
        flowRateScaling: BigInt(1e6),
        suggestedFlowStateDonation: 1000,
      };
    case "HIGHERx":
      return {
        minAllocationPerMonth: 100,
        flowRateScaling: BigInt(1e6),
        suggestedFlowStateDonation: 100,
      };
    case "MPULSEx":
      return {
        minAllocationPerMonth: 0.0001,
        flowRateScaling: BigInt(1e6),
        suggestedFlowStateDonation: 0.001,
      };
    default:
      return {
        minAllocationPerMonth: 1,
        flowRateScaling: BigInt(1e6),
        suggestedFlowStateDonation: 1,
      };
  }
}
