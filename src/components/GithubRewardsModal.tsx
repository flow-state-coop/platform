"use client";

import { useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useAccount } from "wagmi";
import { useQuery, gql } from "@apollo/client";
import { useMediaQuery } from "@/hooks/mediaQuery";
import Stack from "react-bootstrap/Stack";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import Toast from "react-bootstrap/Toast";
import Spinner from "react-bootstrap/Spinner";
import { networks } from "@/lib/networks";
import { getApolloClient } from "@/lib/apollo";

type GithubRewardsModalProps = {
  showModal: boolean;
  chainId: number;
  closeModal: () => void;
};

const GDA_POOL_QUERY = gql`
  query GdaPoolMembersQuery($gdaPool: String!, $address: String!) {
    pool(id: $gdaPool) {
      poolMembers(where: { account_: { id: $address } }) {
        account {
          id
        }
        units
      }
    }
  }
`;

export default function GithubRewardsModal(props: GithubRewardsModalProps) {
  const { showModal, chainId, closeModal } = props;

  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState("");

  const { address } = useAccount();
  const { data: session, status } = useSession();
  const { isMobile, isTablet } = useMediaQuery();

  const network =
    networks.find((network) => network.id === chainId) ?? networks[0];
  const { data: superfluidQueryRes } = useQuery(GDA_POOL_QUERY, {
    client: getApolloClient("superfluid", chainId),
    variables: {
      gdaPool: network.pay16zPool,
      address: address?.toLowerCase(),
    },
    skip: !address,
    pollInterval: 10000,
  });

  const isAuthenticated = status === "authenticated";
  const poolMember = superfluidQueryRes?.pool?.poolMembers[0];
  const isConnected = poolMember?.units && BigInt(poolMember.units) > 0;

  const handleClaim = async () => {
    if (session?.user?.name && address) {
      setIsClaiming(true);

      try {
        const res = await fetch("/api/github-rewards/claim", {
          method: "POST",
          body: JSON.stringify({ address, chainId: chainId }),
        });
        const json = await res.json();

        if (!json.success) {
          setError(json.message);
        }

        console.info("Claiming Profile: ", json);
      } catch (err) {
        console.error(err);

        setError("An error occurred, please try again later");
      }

      setIsClaiming(false);
    }
  };

  const popup = (url: string, title: string) => {
    const dualScreenLeft = window.screenLeft ?? window.screenX;
    const dualScreenTop = window.screenTop ?? window.screenY;

    const width =
      window.innerWidth ?? document.documentElement.clientWidth ?? screen.width;

    const height =
      window.innerHeight ??
      document.documentElement.clientHeight ??
      screen.height;

    const systemZoom = width / window.screen.availWidth;

    const left = (width - 500) / 2 / systemZoom + dualScreenLeft;
    const top = (height - 550) / 2 / systemZoom + dualScreenTop;

    const newWindow = window.open(
      url,
      title,
      `width=${500 / systemZoom},height=${
        550 / systemZoom
      },top=${top},left=${left}`,
    );

    newWindow?.focus();
  };

  return (
    <Modal show={showModal} centered onHide={closeModal}>
      <Modal.Header closeButton className="border-0 fs-4">
        <Modal.Title>Are you an ai16z contributor?</Modal.Title>
      </Modal.Header>
      <Modal.Body className="px-3 pt-0 pb-4 fs-5">
        <p className="mb-0">1) Link your Github to opt-in to funding</p>
        <p className="mb-0">2) Connect to the pool for streaming payment</p>
        <Stack direction="vertical" gap={2} className="align-items-center mt-4">
          <Button
            variant={isAuthenticated ? "dark" : "primary"}
            style={{ width: isMobile ? "100%" : "50%" }}
            onClick={() =>
              isAuthenticated
                ? signOut()
                : isMobile || isTablet
                  ? signIn("github")
                  : popup("/github-auth", "Sign In with Github")
            }
          >
            {isAuthenticated ? "Remove Github Link" : "Link Github"}
          </Button>
          <Button
            disabled={!isAuthenticated || isConnected}
            style={{ width: isMobile ? "100%" : "50%" }}
            onClick={isClaiming ? void 0 : handleClaim}
          >
            {isClaiming ? (
              <Spinner size="sm" />
            ) : isConnected ? (
              "Connected to Pool"
            ) : (
              "Connect to Pool"
            )}
          </Button>
        </Stack>
      </Modal.Body>
      <Toast
        show={!!error}
        delay={4000}
        autohide={true}
        onClose={() => setError("")}
        className="position-absolute top-0 w-100 bg-warning mb-4 p-3 fs-5"
      >
        {error}
      </Toast>
    </Modal>
  );
}
