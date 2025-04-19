import {
  useFlowCouncilContext,
  useAllocationDispatchContext,
} from "@/context/FlowCouncil";

export default function useCouncil() {
  const {
    council,
    councilMetadata,
    flowStateProfiles,
    gdaPool,
    token,
    currentAllocation,
    newAllocation,
  } = useFlowCouncilContext();
  const dispatchNewAllocation = useAllocationDispatchContext();

  return {
    council,
    councilMetadata,
    flowStateProfiles,
    gdaPool,
    token,
    currentAllocation,
    newAllocation,
    dispatchNewAllocation,
  };
}
