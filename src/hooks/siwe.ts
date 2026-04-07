import { signIn } from "next-auth/react";
import { useAccount, useSignMessage } from "wagmi";
import { createSiweMessage } from "viem/siwe";

export default function useSiwe() {
  const { address, chain } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const handleSignIn = async (csfrToken: string) => {
    try {
      const callbackUrl = "/protected";
      const message = createSiweMessage({
        domain: window.location.host,
        address: address!,
        statement: "Sign in with Ethereum to Flow State.",
        uri: window.location.origin,
        version: "1" as const,
        chainId: chain!.id,
        nonce: csfrToken,
      });
      const signature = await signMessageAsync({ message });

      signIn("credentials", {
        message,
        redirect: false,
        signature,
        callbackUrl,
      });
    } catch (error) {
      window.alert(error);
    }
  };

  return { handleSignIn };
}
