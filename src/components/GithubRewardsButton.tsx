"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import GithubRewardsModal from "@/components/GithubRewardsModal";

export default function GithubRewardsButton({ chainId }: { chainId: number }) {
  const [showModal, setShowModal] = useState(false);

  const { data: session, status } = useSession();

  const isLoading = status === "loading";
  const isAuthenticated = status === "authenticated";

  return (
    <>
      <Button
        variant={isLoading || isAuthenticated ? "transparent" : "primary"}
        className="border rounded-3 shadow"
        onClick={() => setShowModal(true)}
        style={{ pointerEvents: isLoading ? "none" : "auto" }}
      >
        {isLoading ? (
          <Spinner size="sm" />
        ) : isAuthenticated ? (
          <Stack direction="horizontal" gap={2} className="align-items-center">
            <Image
              src={session?.user?.image ?? "/github.svg"}
              alt=""
              width={18}
              height={18}
              className="rounded-circle"
            />
            {session?.user?.name}
          </Stack>
        ) : (
          "Claim Profile"
        )}
      </Button>
      <GithubRewardsModal
        showModal={showModal}
        chainId={chainId}
        closeModal={() => setShowModal(false)}
      />
    </>
  );
}
