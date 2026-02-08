import {
  useFlowCouncilContext,
  useAllocationDispatchContext,
  useShowBallotDispatchContext,
} from "@/context/FlowCouncil";

export default function useFlowCouncil() {
  const {
    council,
    councilMetadata,
    projects,
    distributionPool,
    superAppFunderData,
    token,
    showBallot,
    councilMember,
    currentAllocation,
    newAllocation,
  } = useFlowCouncilContext();

  const dispatchNewAllocation = useAllocationDispatchContext();
  const dispatchShowBallot = useShowBallotDispatchContext();

  return {
    council,
    councilMetadata,
    projects,
    distributionPool,
    superAppFunderData,
    token,
    currentAllocation,
    newAllocation,
    showBallot,
    councilMember,
    dispatchNewAllocation,
    dispatchShowBallot,
  };
}
