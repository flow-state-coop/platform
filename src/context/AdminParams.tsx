import { useState, useCallback, createContext, useContext } from "react";

export const AdminParamsContext = createContext<{
  profileId: string | null;
  profileOwner: string | null;
  profileMembers: string[];
  poolId: string | null;
  chainId: number | null;
  updateProfileId: (profileId: string | null) => void;
  updateProfileOwner: (profileOwner: string | null) => void;
  updateProfileMembers: (profileMembers: string[]) => void;
  updatePoolId: (poolId: string | null) => void;
  updateChainId: (chainId: number | null) => void;
} | null>(null);

export function useAdminParamsContext() {
  const context = useContext(AdminParamsContext);

  if (!context) {
    throw Error("AdminParams context was not found");
  }

  return context;
}

export function AdminParamsContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileOwner, setProfileOwner] = useState<string | null>(null);
  const [profileMembers, setProfileMembers] = useState<string[]>([]);
  const [poolId, setPoolId] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  const updateProfileMembers = useCallback(
    (profileMembers: string[]) => setProfileMembers(profileMembers),
    [],
  );

  const updateProfileOwner = useCallback(
    (profileOwner: string | null) => setProfileOwner(profileOwner),
    [],
  );

  const updateProfileId = useCallback(
    (profileId: string | null) => setProfileId(profileId),
    [],
  );

  const updatePoolId = useCallback(
    (poolId: string | null) => setPoolId(poolId),
    [],
  );

  const updateChainId = useCallback(
    (chainId: number | null) => setChainId(chainId),
    [],
  );

  return (
    <AdminParamsContext.Provider
      value={{
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
      }}
    >
      {children}
    </AdminParamsContext.Provider>
  );
}
