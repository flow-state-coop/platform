"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { useSession } from "next-auth/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Sidebar from "../components/Sidebar";
import useSiwe from "@/hooks/siwe";
import { useMediaQuery } from "@/hooks/mediaQuery";

type ReviewProps = {
  chainId?: number;
  councilId?: string;
  csfrToken: string;
};

export default function Review(props: ReviewProps) {
  const { chainId, councilId, csfrToken } = props;

  const { address, chain: connectedChain } = useAccount();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const { isMobile } = useMediaQuery();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();

  const handleSubmit = async () => {};

  if (!chainId || !councilId) {
    return <span className="m-auto fs-4 fw-bold">No council found</span>;
  }

  return (
    <>
      {!isMobile && (
        <Stack direction="vertical" className="w-25 flex-grow-1">
          <Sidebar />
        </Stack>
      )}
      <Stack
        direction="vertical"
        className={!isMobile ? "w-75 px-5" : "w-100 px-3"}
      >
        <Button
          className="my-4 fs-5"
          onClick={() => {
            !address && openConnectModal
              ? openConnectModal()
              : connectedChain?.id !== chainId
                ? switchChain({ chainId })
                : !session
                  ? handleSignIn(csfrToken)
                  : handleSubmit();
          }}
        >
          {!session ? "Sign In With Ethereum" : "Submit"}
        </Button>
      </Stack>
    </>
  );
}
