// Weight normalization is not council-specific; re-exported so council routes
// keep one import site while flow-splitter shares the same apportionment.
export {
  normalizeWeightsToVotingPower,
  votesEqual,
  type BallotVote,
} from "../../normalize";
