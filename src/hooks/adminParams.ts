import { useAdminParamsContext } from "@/context/AdminParams";

export default function useAdminParams() {
  const {
    profileId,
    profileOwner,
    profileMembers,
    poolId,
    updateProfileId,
    updateProfileOwner,
    updateProfileMembers,
    updatePoolId,
  } = useAdminParamsContext();

  return {
    profileId,
    profileOwner,
    profileMembers,
    poolId,
    updateProfileId,
    updateProfileOwner,
    updateProfileMembers,
    updatePoolId,
  };
}
