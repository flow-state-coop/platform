import { useCallback } from "react";
import { getCsrfToken, signIn } from "next-auth/react";
import { useAccount, useSignMessage, useSwitchChain } from "wagmi";
import { ConnectorChainMismatchError } from "@wagmi/core";
import { createSiweMessage } from "viem/siwe";
import { SIWE_MESSAGE_LIFETIME_MS } from "@/lib/siwe";

export default function useSiwe() {
  const { address, chain } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();

  // signIn resolves with an error rather than throwing, and every gated screen
  // reads the session rather than this call, so a swallowed rejection leaves
  // the page looking signed out with nothing said about why.
  const submitSignature = useCallback(
    async (message: string, signature: string) => {
      const result = await signIn("credentials", {
        message,
        redirect: false,
        signature,
      });

      if (!result?.ok) {
        window.alert("Sign in failed, please try again.");
      }
    },
    [],
  );

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
        expirationTime: new Date(Date.now() + SIWE_MESSAGE_LIFETIME_MS),
      });

      try {
        const signature = await signMessageAsync({ message });

        await submitSignature(message, signature);
      } catch (error) {
        if (error instanceof ConnectorChainMismatchError) {
          await switchChainAsync({ chainId: chain.id });
          const signature = await signMessageAsync({ message });

          await submitSignature(message, signature);
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
  }, [address, chain, signMessageAsync, switchChainAsync, submitSignature]);

  return { handleSignIn };
}
