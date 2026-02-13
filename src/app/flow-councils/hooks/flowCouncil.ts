import {
  useFlowCouncilContext,
  useBallotDispatchContext,
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
    currentBallot,
    newBallot,
  } = useFlowCouncilContext();

  const dispatchNewBallot = useBallotDispatchContext();
  const dispatchShowBallot = useShowBallotDispatchContext();

  return {
    council,
    councilMetadata,
    projects,
    distributionPool,
    superAppFunderData,
    token,
    currentBallot,
    newBallot,
    showBallot,
    councilMember,
    dispatchNewBallot,
    dispatchShowBallot,
  };
}
