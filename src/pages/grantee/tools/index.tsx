import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Address } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { gql, useQuery } from "@apollo/client";
import { useClampText } from "use-clamp-text";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Dropdown from "react-bootstrap/Dropdown";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { Project } from "@/types/project";
import { networks } from "@/lib/networks";
import { gdaForwarderAbi } from "@/lib/abi/gdaForwarder";
import { getApolloClient } from "@/lib/apollo";
import { strategyAbi } from "@/lib/abi/strategy";
import { truncateStr } from "@/lib/utils";

type Status = "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";

const PROJECTS_QUERY = gql`
  query ProjectsQuery($address: String!, $chainId: Int!, $poolId: String!) {
    profiles(
      filter: {
        chainId: { equalTo: $chainId }
        profileRolesByChainIdAndProfileId: {
          some: { address: { equalTo: $address } }
        }
        tags: { contains: ["allo", "project"] }
      }
    ) {
      id
      anchorAddress
      metadataCid
      metadata
      profileRolesByChainIdAndProfileId {
        address
      }
    }
    pool(chainId: $chainId, id: $poolId) {
      strategyAddress
      metadata
      matchingToken
      allocationToken
      recipientsByPoolIdAndChainId(
        filter: { recipientAddress: { equalTo: $address } }
      ) {
        id
        status
        anchorAddress
        recipientAddress
      }
    }
  }
`;

export default function GranteeTools() {
  const [selectedProject, setSelectedProject] = useState<
    Project & { recipientId: string; status: string }
  >();
  const [isTransactionConfirming, setIsTransactionConfirming] = useState(false);

  const router = useRouter();
  const { poolId, recipientId } = router.query;
  const chainId = Number(router.query.chainId) ?? null;
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { data: queryRes, loading } = useQuery(PROJECTS_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      chainId,
      address: address?.toLowerCase() ?? "",
      poolId,
    },
    skip: !address || !poolId,
    pollInterval: 3000,
  });
  const { writeContractAsync } = useWriteContract();
  const { data: gdaPoolAddress } = useReadContract({
    address: queryRes?.pool.strategyAddress as Address,
    abi: strategyAbi,
    functionName: "gdaPool",
  });
  const publicClient = usePublicClient();

  const network = networks.filter((network) => network.id === chainId)[0];
  const { data: isConnectedToPool, refetch: refetchIsConnectedToPool } =
    useReadContract({
      address: network?.gdaForwarder,
      abi: gdaForwarderAbi,
      functionName: "isMemberConnected",
      args: [gdaPoolAddress ?? "0x", address ?? "0x"],
    });
  const pool = queryRes?.pool ?? null;
  const allocationToken =
    network?.tokens.find(
      (token) =>
        token.address.toLowerCase() === pool?.allocationToken?.toLowerCase(),
    ) ?? null;
  const matchingToken =
    network?.tokens.find(
      (token) =>
        token.address.toLowerCase() === pool?.matchingToken?.toLowerCase(),
    ) ?? null;
  const recipients = pool?.recipientsByPoolIdAndChainId ?? null;
  const projects =
    queryRes?.profiles?.map((profile: Project) => {
      let recipientId = null;
      let recipientStatus = null;

      for (const recipient of recipients) {
        if (
          recipient.anchorAddress === profile.anchorAddress ||
          recipient.id === address?.toLowerCase()
        ) {
          recipientId = recipient.id;
          recipientStatus = recipient.status;
        }
      }

      return { ...profile, recipientId, status: recipientStatus };
    }) ?? null;
  const hostName =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "";
  const poolUiLink = `${
    hostName
  }/pool/?poolId=${poolId}&chainId=${chainId}&recipientId=${selectedProject?.recipientId}`;
  const framesLink = `https://frames.flowstate.network/frames/grantee/${selectedProject?.recipientId}/${poolId}/${chainId}`;

  useEffect(() => {
    if (!projects || selectedProject) {
      return;
    }

    if (recipientId) {
      const project = projects.find(
        (project: { recipientId: string }) =>
          project.recipientId === recipientId,
      );

      if (project) {
        setSelectedProject(project);

        return;
      }
    }

    for (const project of projects) {
      if (project.status === "APPROVED") {
        setSelectedProject(project);

        break;
      }
    }
  }, [projects, recipientId, selectedProject]);

  const handlePoolConnection = async () => {
    if (!network || !address || !gdaPoolAddress || !publicClient) {
      return;
    }

    try {
      setIsTransactionConfirming(true);

      const hash = await writeContractAsync({
        address: network.gdaForwarder,
        abi: gdaForwarderAbi,
        functionName: "connectPool",
        args: [gdaPoolAddress, "0x"],
      });

      await publicClient.waitForTransactionReceipt({ hash, confirmations: 3 });

      refetchIsConnectedToPool();

      setIsTransactionConfirming(false);
    } catch (err) {
      console.error(err);

      setIsTransactionConfirming(false);
    }
  };

  const Description = ({ description }: { description: string }) => {
    const [descriptionRef, { clampedText }] = useClampText({
      text: description,
      ellipsis: "...",
    });

    return (
      <Card.Text
        ref={descriptionRef as React.RefObject<HTMLParagraphElement>}
        className="m-0 mt-2 mb-2"
      >
        {clampedText}
      </Card.Text>
    );
  };

  return (
    <Stack direction="vertical" className="px-5 py-4 mb-5">
      {queryRes && queryRes.pool === null ? (
        <>Pool not found</>
      ) : loading || !chainId || !poolId ? (
        <Spinner className="m-auto" />
      ) : !network ? (
        <>Network not supported</>
      ) : !connectedChain ? (
        <>Please connect a wallet</>
      ) : (
        <>
          <Card className="border-0">
            <Card.Text as="h1" className="mb-3">
              {pool?.metadata.name}
            </Card.Text>
            <Card.Text className="mb-0">Network: {network.name}</Card.Text>
            <Card.Text className="m-0">
              Direct Donation Token:{" "}
              <Card.Link
                href={`${network.blockExplorer}/address/${queryRes?.pool.allocationToken}`}
                target="_blank"
                style={{ textDecoration: "underline" }}
              >
                {allocationToken?.name ?? "N/A"} (
                {truncateStr(queryRes?.pool.allocationToken ?? "", 12)})
              </Card.Link>
            </Card.Text>
            <Card.Text className="m-0 mb-5">
              Matching Pool Token:{" "}
              <Card.Link
                href={`${network.blockExplorer}/address/${queryRes?.pool.matchingToken}`}
                target="_blank"
                style={{ textDecoration: "underline" }}
              >
                {matchingToken?.name ?? "N/A"} (
                {truncateStr(queryRes?.pool.matchingToken ?? "", 12)})
              </Card.Link>
            </Card.Text>
          </Card>
          {loading ? (
            <Spinner className="m-auto" />
          ) : selectedProject ? (
            <>
              <Dropdown>
                <Dropdown.Toggle
                  className="d-flex justify-content-between align-items-center bg-transparent border border-gray text-black"
                  style={{ width: 256 }}
                >
                  {selectedProject.metadata.title}
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {projects.map(
                    (
                      project: Project & {
                        recipientId: string;
                        status: Status;
                      },
                      i: number,
                    ) =>
                      project.status === "APPROVED" ? (
                        <Dropdown.Item
                          key={i}
                          onClick={() => setSelectedProject(project)}
                        >
                          {project.metadata.title}
                        </Dropdown.Item>
                      ) : null,
                  )}
                </Dropdown.Menu>
              </Dropdown>
              <Description description={selectedProject.metadata.description} />
            </>
          ) : null}
          <Stack direction={isMobile ? "vertical" : "horizontal"} gap={4}>
            <Button
              variant="link"
              href={`${network.superfluidExplorer}/pools/${gdaPoolAddress}`}
              target="_blank"
              className="text-light bg-secondary"
              style={{ width: 256 }}
            >
              View Pool Stats
            </Button>
            <Button
              variant="secondary"
              href={network.superfluidDashboard}
              target="_blank"
              className="text-light"
              style={{ width: 256 }}
            >
              Superfluid Wallet Tools
            </Button>
          </Stack>
          <Card.Text className="m-0 mt-4 fs-3">SQF Pool Connection</Card.Text>
          <Card.Text className="m-0 mb-3">
            Complete a one-time transaction to see matching funds live update in
            your wallet.
          </Card.Text>
          <Button
            disabled={!selectedProject || isConnectedToPool}
            onClick={handlePoolConnection}
            className="text-light"
            style={{ width: 256 }}
          >
            {isTransactionConfirming ? (
              <Spinner size="sm" className="m-auto" />
            ) : isConnectedToPool ? (
              "Connected"
            ) : (
              "Connect to Pool"
            )}
          </Button>
          {selectedProject && (
            <>
              <Card.Text className="fs-3 mt-4 mb-0">Direct Donation</Card.Text>
              <Card.Text className="fs-6 mb-3">
                Share a direct link to checkout with your grant with your
                community on social, newsletters, etc.
              </Card.Text>
              <Stack
                direction={isMobile ? "vertical" : "horizontal"}
                gap={isMobile ? 2 : 4}
              >
                <Badge
                  className="bg-transparent px-2 py-3 border border-gray text-black text-start text-truncate"
                  style={{ width: isMobile ? "auto" : 400 }}
                >
                  {poolUiLink}
                </Badge>
                <Button
                  variant="info"
                  className="text-light"
                  style={{ width: isMobile ? "auto" : 128 }}
                  onClick={() => navigator.clipboard.writeText(poolUiLink)}
                >
                  Copy
                </Button>
              </Stack>
              <Card.Text className="fs-3 mt-4 mb-0">Farcaster Frame</Card.Text>
              <Card.Text className="fs-6 mb-3">
                Share your project-specific Frame on Farcaster for users to
                check your current matching multiplier & jump to checkout.
              </Card.Text>
              <Stack
                direction={isMobile ? "vertical" : "horizontal"}
                gap={isMobile ? 2 : 4}
              >
                <Badge
                  className="bg-transparent px-2 py-3 border border-gray text-start text-black text-truncate"
                  style={{ width: isMobile ? "auto" : 400 }}
                >
                  {framesLink}
                </Badge>
                <Button
                  variant="info"
                  className="text-light"
                  style={{ width: isMobile ? "auto" : 128 }}
                  onClick={() => navigator.clipboard.writeText(framesLink)}
                >
                  Copy
                </Button>
              </Stack>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
