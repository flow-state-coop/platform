export function getSupportFlowStateConfig(token: string) {
  switch (token) {
    case "ETHx":
      return {
        minAllocationPerMonth: 0.0004,
        suggestedFlowStateDonation: 0.001,
      };
    case "ARBx":
      return {
        minAllocationPerMonth: 3,
        suggestedFlowStateDonation: 5,
      };
    case "CELOx":
      return {
        minAllocationPerMonth: 3,
        suggestedFlowStateDonation: 5,
      };
    case "DEGENx":
      return {
        minAllocationPerMonth: 500,
        suggestedFlowStateDonation: 1000,
      };
    case "HIGHERx":
      return {
        minAllocationPerMonth: 100,
        suggestedFlowStateDonation: 100,
      };
    case "G$":
      return {
        minAllocationPerMonth: 0,
        suggestedFlowStateDonation: 1000,
      };
    default:
      return {
        minAllocationPerMonth: 1,
        suggestedFlowStateDonation: 1,
      };
  }
}
