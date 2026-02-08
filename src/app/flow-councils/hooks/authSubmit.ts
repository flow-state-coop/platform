import { useAccount, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useSession } from "next-auth/react";
import useSiwe from "@/hooks/siwe";

export default function useAuthSubmit(chainId: number, csrfToken: string) {
  const { openConnectModal } = useConnectModal();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();

  const handleSubmit = (
    isValid: boolean,
    setValidated: (v: boolean) => void,
    onSubmit: () => void,
  ) => {
    setValidated(true);
    if (!address && openConnectModal) {
      openConnectModal();
    } else if (connectedChain?.id !== chainId) {
      switchChain({ chainId });
    } else if (!session || session.address !== address) {
      handleSignIn(csrfToken);
    } else if (isValid) {
      onSubmit();
    }
  };

  return { address, session, handleSubmit };
}
