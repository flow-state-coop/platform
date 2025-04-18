import { signIn } from "next-auth/react";
import { SiweMessage } from "siwe";
import { useAccount, useSignMessage } from "wagmi";

export default function useSiwe() {
  const { address, chain } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const handleSignIn = async (csfrToken: string) => {
    try {
      const callbackUrl = "/protected";
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in with Ethereum to Flow State.",
        uri: window.location.origin,
        version: "1",
        chainId: chain?.id,
        nonce: csfrToken,
      });
      const signature = await signMessageAsync({
        message: message.prepareMessage(),
      });

      signIn("credentials", {
        message: JSON.stringify(message),
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
