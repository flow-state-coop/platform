import { useCallback } from "react";
import { getCsrfToken, signIn } from "next-auth/react";
import { useAccount, useSignMessage, useSwitchChain } from "wagmi";
import { ConnectorChainMismatchError } from "@wagmi/core";
import { createSiweMessage } from "viem/siwe";

export default function useSiwe() {
  const { address, chain } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();

  const handleSignIn = useCallback(async () => {
    try {
      if (!address || !chain) return;

      const nonce = await getCsrfToken();
      if (!nonce) return;

      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in with Ethereum to Flow State.",
        uri: window.location.origin,
        version: "1",
        chainId: chain.id,
        nonce,
      });

      try {
        const signature = await signMessageAsync({ message });

        signIn("credentials", {
          message,
          redirect: false,
          signature,
        });
      } catch (error) {
        if (error instanceof ConnectorChainMismatchError) {
          await switchChainAsync({ chainId: chain.id });
          const signature = await signMessageAsync({ message });

          signIn("credentials", {
            message,
            redirect: false,
            signature,
          });
        } else {
          throw error;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "UserRejectedRequestError") {
        return;
      }
      window.alert(error);
    }
  }, [address, chain, signMessageAsync, switchChainAsync]);

  return { handleSignIn };
}
