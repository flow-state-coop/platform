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
    currentAllocation,
    newAllocation,
  } = useFlowCouncilContext();
  const dispatchNewAllocation = useAllocationDispatchContext();

  return {
    council,
    councilMetadata,
    flowStateProfiles,
    gdaPool,
    currentAllocation,
    newAllocation,
    dispatchNewAllocation,
  };
}
