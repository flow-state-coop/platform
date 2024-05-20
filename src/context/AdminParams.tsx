import { useState, createContext, useContext } from "react";

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

  return (
    <AdminParamsContext.Provider
      value={{
        profileId,
        profileOwner,
        profileMembers,
        poolId,
        chainId,
        updateProfileId: (profileId: string | null) => setProfileId(profileId),
        updateProfileOwner: (profileOwner: string | null) =>
          setProfileOwner(profileOwner),
        updateProfileMembers: (profileMembers: string[]) =>
          setProfileMembers(profileMembers),
        updatePoolId: (poolId: string | null) => setPoolId(poolId),
        updateChainId: (chainId: number | null) => setChainId(chainId),
      }}
    >
      {children}
    </AdminParamsContext.Provider>
  );
}
