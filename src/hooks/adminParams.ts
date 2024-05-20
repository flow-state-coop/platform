import { useAdminParamsContext } from "@/context/AdminParams";

export default function useAdminParams() {
  const {
    profileId,
    profileOwner,
    profileMembers,
    poolId,
    chainId,
    updateProfileId,
    updateProfileOwner,
    updateProfileMembers,
    updatePoolId,
    updateChainId,
  } = useAdminParamsContext();

  return {
    profileId,
    profileOwner,
    profileMembers,
    poolId,
    chainId,
    updateProfileId,
    updateProfileOwner,
    updateProfileMembers,
    updatePoolId,
    updateChainId,
  };
}
