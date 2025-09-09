import {
  useFlowCouncilContext,
  useBallotDispatchContext,
  useShowBallotDispatchContext,
} from "@/context/FlowCouncil";

export default function useCouncil() {
  const {
    flowCouncil,
    flowCouncilMetadata,
    flowStateProfiles,
    distributionPool,
    token,
    showBallot,
    voter,
    currentBallot,
    newBallot,
  } = useFlowCouncilContext();

  const dispatchNewBallot = useBallotDispatchContext();
  const dispatchShowBallot = useShowBallotDispatchContext();

  return {
    flowCouncil,
    flowCouncilMetadata,
    flowStateProfiles,
    distributionPool,
    token,
    currentBallot,
    newBallot,
    showBallot,
    voter,
    dispatchNewBallot,
    dispatchShowBallot,
  };
}
