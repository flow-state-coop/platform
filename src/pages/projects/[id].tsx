import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { parseEther } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { gql, useQuery } from "@apollo/client";
import { createVerifiedFetch } from "@helia/verified-fetch";
import { usePostHog } from "posthog-js/react";
import Container from "react-bootstrap/Container";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import ProjectUpdateModal from "@/components/ProjectUpdateModal";
import PoolCard from "@/components/PoolCard";
import { GDAPool } from "@/types/gdaPool";
import { strategyAbi } from "@/lib/abi/strategy";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { networks } from "@/lib/networks";
import { getApolloClient } from "@/lib/apollo";
import { getPoolFlowRateConfig } from "@/lib/poolFlowRateConfig";
import { calcMatchingImpactEstimate } from "@/lib/matchingImpactEstimate";
import { getPlaceholderImageSrc } from "@/lib/utils";
import { IPFS_GATEWAYS, SECONDS_IN_MONTH } from "@/lib/constants";

const PROJECT_QUERY = gql`
  query ProjectQuery($id: String!, $chainId: Int!) {
    profile(id: $id, chainId: $chainId) {
      id
      anchorAddress
      metadataCid
      metadata
      profileRolesByChainIdAndProfileId {
        address
        role
      }
    }
  }
`;

const POOLS_BY_ANCHOR_ADDRESS = gql`
  query PoolsByAnchorAddress($chainId: Int!, $anchorAddress: String!) {
    pools(
      filter: {
        chainId: { equalTo: $chainId }
        recipientsByPoolIdAndChainId: {
          some: { anchorAddress: { equalTo: $anchorAddress } }
        }
      }
    ) {
      id
      metadata
      allocationToken
      matchingToken
      strategyAddress
      recipientsByPoolIdAndChainId {
        id
        status
        recipientAddress
        anchorAddress
      }
    }
  }
`;

const GDA_POOLS = gql`
  query GdaPools($gdaPools: [String]) {
    pools(where: { id_in: $gdaPools }) {
      id
      flowRate
      adjustmentFlowRate
      totalAmountFlowedDistributedUntilUpdatedAt
      updatedAtTimestamp
      totalUnits
      poolMembers {
        account {
          id
        }
        units
        updatedAtTimestamp
        totalAmountReceivedUntilUpdatedAt
        isConnected
      }
      poolDistributors {
        account {
          id
        }
        flowRate
        totalAmountFlowedDistributedUntilUpdatedAt
        updatedAtTimestamp
      }
    }
  }
`;

export default function Project() {
  const [showProjectUpdateModal, setShowProjectUpdateModal] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");

  const router = useRouter();
  const chainId = Number(router.query.chainId) ?? null;
  const postHog = usePostHog();
  const { address } = useAccount();
  const { isMobile, isTablet, isSmallScreen, isMediumScreen } = useMediaQuery();
  const { data: projectQueryRes, loading } = useQuery(PROJECT_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      chainId: chainId,
      id: router.query.id,
    },
    skip: !chainId,
    pollInterval: 5000,
  });
  const { data: poolsQueryRes } = useQuery(POOLS_BY_ANCHOR_ADDRESS, {
    client: getApolloClient("flowState"),
    variables: {
      chainId: chainId,
      anchorAddress: projectQueryRes?.profile?.anchorAddress,
    },
    skip: !projectQueryRes?.profile?.anchorAddress,
  });
  const strategyAddresses = poolsQueryRes?.pools?.map(
    (pool: { strategyAddress: string }) => pool.strategyAddress,
  );
  const { data: gdaPoolAddresses } = useReadContracts({
    contracts: strategyAddresses?.map((address: string) => {
      return {
        address,
        abi: strategyAbi,
        functionName: "gdaPool",
        chainId,
      };
    }),
    query: { enabled: strategyAddresses?.length > 0 },
  });
  const { data: superfluidQueryRes } = useQuery(GDA_POOLS, {
    client: getApolloClient("superfluid", chainId),
    variables: {
      gdaPools:
        gdaPoolAddresses?.map((gdaPoolAddress) =>
          (gdaPoolAddress as { result: string }).result.toLowerCase(),
        ) ?? [],
    },
    skip: !gdaPoolAddresses || gdaPoolAddresses.length === 0,
    pollInterval: 10000,
  });

  const project = projectQueryRes?.profile;
  const pools = poolsQueryRes?.pools;
  const network = networks.filter((network) => network.id === chainId)[0];
  const placeholderLogo = getPlaceholderImageSrc();
  const placeholderBanner = getPlaceholderImageSrc();

  const matchingImpactEstimates = useMemo(() => {
    if (!superfluidQueryRes?.pools || !pools || !network) {
      return [];
    }

    const matchingImpactEstimates: bigint[] = [];
    const matchingPools: GDAPool[] = superfluidQueryRes?.pools;

    for (const i in matchingPools) {
      const matchingPool = matchingPools[i];
      const pool = pools[i];
      const recipientAddress = pool.recipientsByPoolIdAndChainId.filter(
        (recipient: { id: string }) => recipient.id === project.anchorAddress,
      );
      const adjustedFlowRate =
        BigInt(matchingPool.flowRate) - BigInt(matchingPool.adjustmentFlowRate);
      const member = matchingPool.poolMembers.find(
        (member: { account: { id: string } }) =>
          member.account.id === recipientAddress,
      );
      const memberFlowRate =
        BigInt(matchingPool.totalUnits) > 0
          ? (BigInt(member?.units ?? 0) * adjustedFlowRate) /
            BigInt(matchingPool.totalUnits)
          : BigInt(0);
      const allocationToken = network?.tokens.find(
        (token) => token.address.toLowerCase === pool.allocationToken,
      );
      const poolFlowRateConfig = getPoolFlowRateConfig(
        allocationToken?.name ?? "",
      );
      const matchingImpactEstimate = calcMatchingImpactEstimate({
        totalFlowRate: BigInt(matchingPool.flowRate ?? 0),
        totalUnits: BigInt(matchingPool.totalUnits ?? 0),
        granteeUnits: BigInt(member?.units ?? 0),
        granteeFlowRate: memberFlowRate,
        previousFlowRate: BigInt(0),
        newFlowRate:
          parseEther(poolFlowRateConfig.minAllocationPerMonth.toString()) /
          BigInt(SECONDS_IN_MONTH),
        flowRateScaling: poolFlowRateConfig.flowRateScaling,
      });

      matchingImpactEstimates.push(matchingImpactEstimate);
    }

    return matchingImpactEstimates;
  }, [superfluidQueryRes, pools, project, network]);

  useEffect(() => {
    if (router.query.edit) {
      setShowProjectUpdateModal(true);
    }
  }, [router.query]);

  useEffect(
    () => postHog.stopSessionRecording(),
    [postHog, postHog.decideEndpointWasHit],
  );

  useEffect(() => {
    (async () => {
      if (!project) {
        return;
      }

      const verifiedFetch = await createVerifiedFetch({
        gateways: IPFS_GATEWAYS,
      });

      const { logoImg, bannerImg } = project.metadata;

      if (logoImg) {
        try {
          const logoRes = await verifiedFetch(`ipfs://${logoImg}`);
          const logoBlob = await logoRes.blob();
          const logoUrl = URL.createObjectURL(logoBlob);

          setLogoUrl(logoUrl);
        } catch (err) {
          console.error(err);
        }
      }

      if (bannerImg) {
        try {
          const bannerRes = await verifiedFetch(`ipfs://${bannerImg}`);
          const bannerBlob = await bannerRes.blob();
          const bannerUrl = URL.createObjectURL(bannerBlob);

          setBannerUrl(bannerUrl);
        } catch (err) {
          console.error(err);
        }
      }
    })();
  }, [project]);

  return (
    <>
      <Container
        className="mx-auto p-0 mb-5"
        style={{
          maxWidth:
            isMobile || isTablet
              ? "100%"
              : isSmallScreen
                ? 1000
                : isMediumScreen
                  ? 1300
                  : 1600,
        }}
      >
        {!network ? (
          <>Network not supported</>
        ) : loading ? (
          <Spinner className="m-auto" />
        ) : (
          <>
            <Card
              className="position-relative border-0"
              style={{ height: isMobile ? 180 : isTablet ? 340 : 550 }}
            >
              <Card.Img
                variant="top"
                src={bannerUrl === "" ? placeholderBanner : bannerUrl}
                height={isMobile ? 200 : isTablet ? 300 : 500}
                className="bg-light rounded-0"
              />
              <Image
                src={logoUrl === "" ? placeholderLogo : logoUrl}
                alt=""
                width={isMobile || isTablet ? 100 : 200}
                height={isMobile || isTablet ? 100 : 200}
                className="rounded-4 position-absolute border border-2 border-light bg-white"
                style={{
                  bottom: isTablet ? -10 : -50,
                  left: isMobile ? 30 : 50,
                }}
              />
            </Card>
            <Stack
              direction="horizontal"
              className="justify-content-between mt-5 px-3 sm:px-0"
            >
              <Card.Text className="bg-transparent border-0 m-0 p-0 fs-1">
                {project?.metadata?.title ?? "N/A"}
              </Card.Text>
              {project?.profileRolesByChainIdAndProfileId.find(
                (profile: { role: "OWNER" | "MANAGER" }) =>
                  profile.role === "OWNER",
              )?.address === address?.toLowerCase() && (
                <Button
                  variant="secondary"
                  className="w-20"
                  onClick={() => setShowProjectUpdateModal(true)}
                >
                  Edit
                </Button>
              )}
            </Stack>
            <Card.Text className="bg-transparent border-0 m-0 px-3 sm:px-0 fs-5 text-info text-truncate">
              {project?.profileRolesByChainIdAndProfileId.filter(
                (profile: { role: "OWNER" | "MANAGER" }) =>
                  profile.role === "OWNER",
              )[0]?.address ?? "N/A"}
            </Card.Text>
            <Stack
              direction="horizontal"
              className="flex-wrap my-2 px-3 sm:px-0"
              style={{ rowGap: 8 }}
            >
              {!!project?.metadata.website && (
                <Button
                  variant="link"
                  href={project.metadata.website}
                  target="_blank"
                  className="d-flex gap-1 align-items-center p-0 text-info"
                  style={{ width: !isMobile ? "33%" : "" }}
                >
                  <Image src="/link.svg" alt="link" width={18} height={18} />
                  <Card.Text className="text-truncate">
                    {project.metadata.website}
                  </Card.Text>
                </Button>
              )}
              {!!project?.metadata.projectGithub && (
                <Button
                  variant="link"
                  href={`https://github.com/${project.metadata.projectGithub}`}
                  target="_blank"
                  className="d-flex gap-1 align-items-center p-0 text-info"
                  style={{ width: !isMobile ? "33%" : "" }}
                >
                  <Image
                    src="/github.svg"
                    alt="github"
                    width={18}
                    height={18}
                  />
                  <Card.Text className="text-truncate">
                    {`github.com/${project.metadata.projectGithub}`}
                  </Card.Text>
                </Button>
              )}
              {!!project?.metadata.projectTwitter && (
                <Button
                  variant="link"
                  href={`https://x.com/${project.metadata.projectTwitter}`}
                  target="_blank"
                  className="d-flex gap-1 align-items-center p-0 text-info"
                  style={{ width: !isMobile ? "33%" : "" }}
                >
                  <Image src="/x-logo.svg" alt="x" width={14} height={14} />
                  <Card.Text className="text-truncate">
                    {`x.com/${project.metadata.projectTwitter}`}
                  </Card.Text>
                </Button>
              )}
              {!!project?.metadata.projectWarpcast && (
                <Button
                  variant="link"
                  href={`https://warpcast.com/${project.metadata.projectWarpcast}`}
                  target="_blank"
                  className="d-flex gap-1 align-items-center p-0 text-info"
                  style={{ width: !isMobile ? "33%" : "" }}
                >
                  <Image
                    src="/warpcast.svg"
                    alt="warpcast"
                    width={16}
                    height={16}
                  />
                  <Card.Text className="text-truncate">
                    {`warpcast.com/${project.metadata.projectWarpcast}`}
                  </Card.Text>
                </Button>
              )}
              {!!project?.metadata.projectLens && (
                <Button
                  variant="link"
                  href={`https://hey.xyz/u/${project.metadata.projectLens}`}
                  target="_blank"
                  className="d-flex gap-1 align-items-center p-0 text-info"
                  style={{ width: !isMobile ? "33%" : "" }}
                >
                  <Image src="/hey.png" alt="lens" width={16} height={16} />
                  <Card.Text className="text-truncate">
                    {`hey.xyz/u/${project.metadata.projectLens}`}
                  </Card.Text>
                </Button>
              )}
              {!!project?.metadata.projectGuild && (
                <Button
                  variant="link"
                  href={`https://guild.xyz/${project.metadata.projectGuild}`}
                  target="_blank"
                  className="d-flex gap-1 align-items-center p-0 text-info"
                  style={{ width: !isMobile ? "33%" : "" }}
                >
                  <Image src="/guild.svg" alt="guild" width={16} height={16} />
                  <Card.Text className="text-truncate">
                    {`guild.xyz/${project.metadata.projectGuild}`}
                  </Card.Text>
                </Button>
              )}
              {!!project?.metadata.projectTelegram && (
                <Button
                  variant="link"
                  href={`https://t.me/${project.metadata.projectTelegram}`}
                  target="_blank"
                  className="d-flex gap-1 align-items-center p-0 text-info"
                  style={{ width: !isMobile ? "33%" : "" }}
                >
                  <Image
                    src="/telegram.svg"
                    alt="telegram"
                    width={16}
                    height={16}
                  />
                  <Card.Text className="text-truncate">
                    {`t.me/${project.metadata.projectTelegram}`}
                  </Card.Text>
                </Button>
              )}
              {!!project?.metadata.projectDiscord && (
                <Button
                  variant="link"
                  href={`https://discord.com/invite/${project.metadata.projectDiscord}`}
                  target="_blank"
                  className="d-flex gap-1 align-items-center p-0 text-info"
                  style={{ width: !isMobile ? "33%" : "" }}
                >
                  <Image
                    src="/discord.svg"
                    alt="discord"
                    width={16}
                    height={16}
                  />
                  <Card.Text className="text-truncate">
                    {`discord.com/invite/${project.metadata.projectDiscord}`}
                  </Card.Text>
                </Button>
              )}
            </Stack>
            <Card.Text className="px-3 sm:px-0">
              {project?.metadata?.description}
            </Card.Text>
            <Stack
              direction="horizontal"
              gap={5}
              className="justify-content-center flex-wrap my-5"
            >
              {matchingImpactEstimates.length > 0
                ? pools?.map(
                    (
                      pool: {
                        id: string;
                        allocationToken: string;
                        matchingToken: string;
                        metadata: { name: string };
                        recipientsByPoolIdAndChainId: {
                          id: string;
                          recipientAddress: string;
                        }[];
                      },
                      i: number,
                    ) => (
                      <PoolCard
                        pool={pool}
                        matchingPool={superfluidQueryRes?.pools[i]}
                        project={project}
                        network={network}
                        key={i}
                      />
                    ),
                  )
                : null}
            </Stack>
          </>
        )}
      </Container>
      {network && project && (
        <ProjectUpdateModal
          show={showProjectUpdateModal}
          handleClose={() => setShowProjectUpdateModal(false)}
          registryAddress={network.alloRegistry}
          project={project}
        />
      )}
    </>
  );
}
