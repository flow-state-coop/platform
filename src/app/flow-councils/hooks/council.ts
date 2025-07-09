import {
  useFlowCouncilContext,
  useAllocationDispatchContext,
  useShowBallotDispatchContext,
} from "@/context/FlowCouncil";

export default function useCouncil() {
  const {
    council,
    councilMetadata,
    flowStateProfiles,
    gdaPool,
    token,
    showBallot,
    currentAllocation,
    newAllocation,
  } = useFlowCouncilContext();

  const dispatchNewAllocation = useAllocationDispatchContext();
  const dispatchShowBallot = useShowBallotDispatchContext();

  return {
    council,
    councilMetadata,
    flowStateProfiles,
    gdaPool,
    token,
    currentAllocation,
    newAllocation,
    showBallot,
    dispatchNewAllocation,
    dispatchShowBallot,
  };
}
