"use client";

import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import { useQuery, gql } from "@apollo/client";
import { parseEther, Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { usePostHog } from "posthog-js/react";
import { useInView } from "react-intersection-observer";
import Container from "react-bootstrap/Container";
import Stack from "react-bootstrap/Stack";
import Dropdown from "react-bootstrap/Dropdown";
import Spinner from "react-bootstrap/Spinner";
import SuperfluidContextProvider from "@/context/Superfluid";
import PoolInfo from "./components/PoolInfo";
import Grantee from "./components/Grantee";
import GranteeFunding from "./components/GranteeFunding";
import MatchingPoolFunding from "./components/MatchingPoolFunding";
import { Pool as PoolType } from "@/types/pool";
import { Recipient } from "@/types/recipient";
import { ProjectMetadata } from "@/types/project";
import { Token } from "@/types/token";
import { Inflow } from "@/types/inflow";
import { Outflow } from "@/types/outflow";
import { strategyAbi } from "@/lib/abi/strategy";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useDonorParams from "@/hooks/donorParams";
import { erc721CheckerAbi } from "@/lib/abi/erc721Checker";
import { erc721Abi } from "@/lib/abi/erc721";
import { networks } from "@/app/sqf/lib/networks";
import { getPoolFlowRateConfig } from "@/lib/poolFlowRateConfig";
import { getApolloClient } from "@/lib/apollo";
import { calcMatchingImpactEstimate } from "@/lib/matchingImpactEstimate";
import { fetchIpfsJson } from "@/lib/fetchIpfs";
import { shuffle, getPlaceholderImageSrc } from "@/lib/utils";
import {
  SECONDS_IN_MONTH,
  ZERO_ADDRESS,
  FLOW_STATE_RECEIVER,
} from "@/lib/constants";

type PoolProps = {
  chainId: number;
  poolId: string;
  recipientId: string;
  editPoolDistribution: boolean;
};

export type Grantee = {
  id: string;
  recipientAddress: string;
  superappAddress: string;
  metadata: ProjectMetadata;
  bannerCid: string;
  twitter: string;
  farcaster: string;
  inflow: Inflow;
  matchingFlowRate: bigint;
  impactMatchingEstimate: bigint;
  allocationTokenInfo: Token;
  matchingTokenInfo: Token;
  userOutflow: Outflow | null;
  placeholderLogo: string;
  placeholderBanner: string;
};

enum SortingMethod {
  RANDOM = "Random Order",
  ALPHABETICAL = "Alphabetical",
  POPULAR = "Popular",
}

const POOL_QUERY = gql`
  query PoolQuery($poolId: String!, $chainId: Int!) {
    pool(chainId: $chainId, id: $poolId) {
      id
      metadataCid
      strategyAddress
      matchingToken
      allocationToken
      chainId
      recipientsByPoolIdAndChainId(
        first: 1000
        condition: { status: APPROVED }
      ) {
        id
        recipientAddress
        metadataCid
        superappAddress
      }
    }
  }
`;

const STREAM_QUERY = gql`
  query StreamQuery(
    $superapps: [String]
    $gdaPool: String
    $userAddress: String
    $token: String
  ) {
    accounts(where: { id_in: $superapps }) {
      id
      accountTokenSnapshots {
        totalAmountStreamedInUntilUpdatedAt
        updatedAtTimestamp
        totalInflowRate
        activeIncomingStreamCount
        token {
          id
        }
      }
    }
    pool(id: $gdaPool) {
      id
      flowRate
      adjustmentFlowRate
      totalAmountFlowedDistributedUntilUpdatedAt
      updatedAtTimestamp
      totalUnits
      poolMembers(first: 1000, where: { units_not: "0" }) {
        account {
          id
        }
        units
        updatedAtTimestamp
        totalAmountReceivedUntilUpdatedAt
      }
      poolDistributors(first: 1000, where: { flowRate_not: "0" }) {
        account {
          id
        }
        flowRate
        totalAmountFlowedDistributedUntilUpdatedAt
        updatedAtTimestamp
      }
    }
    account(id: $userAddress) {
      accountTokenSnapshots {
        totalNetFlowRate
        totalOutflowRate
        totalDeposit
        maybeCriticalAtTimestamp
        balanceUntilUpdatedAt
        updatedAtTimestamp
        token {
          id
        }
      }
      outflows(
        where: { token: $token }
        orderBy: updatedAtTimestamp
        orderDirection: desc
      ) {
        receiver {
          id
        }
        streamedUntilUpdatedAt
        updatedAtTimestamp
        currentFlowRate
      }
    }
  }
`;

const GRANTEES_BATCH_SIZE = 20;

export default function Pool(props: PoolProps) {
  const { poolId, chainId, recipientId, editPoolDistribution } = props;

  const [pool, setPool] = useState<PoolType | null>(null);
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [grantees, setGrantees] = useState<Grantee[]>([]);
  const [directTotal, setDirectTotal] = useState(BigInt(0));
  const [sortingMethod, setSortingMethod] = useState(SortingMethod.RANDOM);
  const [transactionPanelState, setTransactionPanelState] = useState<{
    show: boolean;
    isFundingMatchingPool: boolean;
    selectedGrantee: number | null;
  }>({
    show: false,
    isFundingMatchingPool: false,
    selectedGrantee: null,
  });

  const skipGrantees = useRef(0);
  const granteesBatch = useRef(1);
  const hasNextGrantee = useRef(true);
  const directTotalTimerId = useRef<NodeJS.Timeout>();

  const [sentryRef, inView] = useInView();

  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const { address } = useAccount();
  const { updateDonorParams } = useDonorParams();
  const postHog = usePostHog();
  const { data: flowStateQueryRes } = useQuery(POOL_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      poolId,
      chainId,
    },
  });
  const { data: gdaPoolAddress } = useReadContract({
    address: flowStateQueryRes?.pool?.strategyAddress,
    abi: strategyAbi,
    functionName: "gdaPool",
    chainId,
  });
  const { data: superfluidQueryRes } = useQuery(STREAM_QUERY, {
    client: getApolloClient("superfluid", chainId),
    variables: {
      superapps:
        flowStateQueryRes?.pool?.recipientsByPoolIdAndChainId?.map(
          (recipient: { superappAddress: string }) => recipient.superappAddress,
        ) ?? [],
      gdaPool: gdaPoolAddress?.toLowerCase(),
      userAddress: address?.toLowerCase() ?? "0x",
      token: flowStateQueryRes?.pool?.allocationToken ?? "0x",
    },
    pollInterval: 10000,
  });
  const { data: nftChecker } = useReadContract({
    address: flowStateQueryRes?.pool?.strategyAddress,
    abi: strategyAbi,
    functionName: "checker",
    chainId,
  });
  const { data: requiredNftAddress } = useReadContract({
    address: nftChecker,
    abi: erc721CheckerAbi,
    functionName: "erc721",
    query: { enabled: nftChecker && nftChecker !== ZERO_ADDRESS },
    chainId,
  });
  const { data: nftBalance } = useReadContract({
    address: requiredNftAddress as Address,
    abi: erc721Abi,
    functionName: "balanceOf",
    args: [address ?? "0x"],
    chainId,
    query: {
      enabled: !!address && !!requiredNftAddress,
      refetchInterval: 10000,
    },
  });
  const flowRateToFlowState = superfluidQueryRes?.account?.outflows?.find(
    (outflow: { receiver: { id: string } }) =>
      outflow.receiver.id === FLOW_STATE_RECEIVER,
  );
  const hostName =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "";

  const matchingPool = superfluidQueryRes?.pool ?? null;
  const network = networks.find((network) => network.id === chainId);
  const isEligible = !!nftBalance;

  const allocationTokenInfo = useMemo(
    () =>
      network?.tokens.find(
        (token) => pool?.allocationToken === token.address.toLowerCase(),
      ) ?? {
        symbol: "N/A",
        address: (pool?.allocationToken as Address) ?? "",
        icon: "",
      },
    [network, pool],
  );
  const matchingTokenInfo = useMemo(
    () =>
      network?.tokens.find(
        (token) => pool?.matchingToken === token.address.toLowerCase(),
      ) ?? {
        symbol: "N/A",
        address: (pool?.matchingToken as Address) ?? "",
        icon: "",
      },
    [network, pool],
  );

  const getGrantee = useCallback(
    (recipient: Recipient) => {
      const superappAccount = superfluidQueryRes.accounts.find(
        (account: { id: string }) => account.id === recipient.superappAddress,
      );
      const userOutflow = superfluidQueryRes.account?.outflows?.find(
        (outflow: { receiver: { id: string } }) =>
          outflow.receiver.id === recipient.superappAddress,
      );
      const matchingPool = superfluidQueryRes.pool;
      const adjustedFlowRate =
        BigInt(matchingPool.flowRate) - BigInt(matchingPool.adjustmentFlowRate);
      const member = superfluidQueryRes.pool.poolMembers.find(
        (member: { account: { id: string } }) =>
          member.account.id === recipient.recipientAddress,
      );
      const memberFlowRate =
        BigInt(matchingPool.totalUnits) > 0
          ? (BigInt(member?.units ?? 0) * adjustedFlowRate) /
            BigInt(matchingPool.totalUnits)
          : BigInt(0);
      const poolFlowRateConfig = getPoolFlowRateConfig(
        allocationTokenInfo.symbol,
      );
      const impactMatchingEstimate = calcMatchingImpactEstimate({
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

      return {
        id: recipient.id,
        recipientAddress: recipient.recipientAddress,
        superappAddress: recipient.superappAddress,
        metadata: recipient.metadata,
        bannerCid: recipient.metadata.bannerImg,
        twitter: recipient.metadata.projectTwitter,
        farcaster: recipient.metadata.projectWarpcast,
        inflow: superappAccount.accountTokenSnapshots[0],
        matchingFlowRate: memberFlowRate ?? BigInt(0),
        impactMatchingEstimate,
        allocationTokenInfo,
        matchingTokenInfo,
        userOutflow:
          userOutflow && userOutflow.currentFlowRate !== "0"
            ? userOutflow
            : null,
        placeholderLogo: getPlaceholderImageSrc(),
        placeholderBanner: getPlaceholderImageSrc(),
      };
    },
    [superfluidQueryRes, allocationTokenInfo, matchingTokenInfo],
  );

  const sortGrantees = useCallback(
    (grantees: Grantee[]) => {
      if (sortingMethod === SortingMethod.RANDOM) {
        return shuffle(grantees);
      }

      if (sortingMethod === SortingMethod.ALPHABETICAL) {
        return grantees.sort((a, b) => {
          if (a.metadata.title < b.metadata.title) {
            return -1;
          }

          if (a.metadata.title > b.metadata.title) {
            return 1;
          }

          return 0;
        });
      }

      if (sortingMethod === SortingMethod.POPULAR) {
        return grantees.sort(
          (a, b) =>
            b.inflow.activeIncomingStreamCount -
            a.inflow.activeIncomingStreamCount,
        );
      }

      return grantees;
    },
    [sortingMethod],
  );

  useEffect(() => {
    (async () => {
      if (!flowStateQueryRes?.pool?.recipientsByPoolIdAndChainId) {
        return;
      }

      const recipients = [];
      const pool = flowStateQueryRes.pool ?? null;

      for (const recipient of flowStateQueryRes.pool
        .recipientsByPoolIdAndChainId) {
        const metadata = await fetchIpfsJson(recipient.metadataCid);

        if (metadata) {
          recipients.push({ ...recipient, metadata });
        }
      }

      const poolMetadata = await fetchIpfsJson(
        flowStateQueryRes.pool.metadataCid,
      );

      if (poolMetadata) {
        setPool({ ...pool, metadata: poolMetadata });
      }

      setRecipients(recipients);
    })();
  }, [flowStateQueryRes]);

  useEffect(() => {
    if (superfluidQueryRes?.accounts.length > 0) {
      const calcDirectTotal = () => {
        let directTotal = BigInt(0);

        for (const account of superfluidQueryRes.accounts) {
          const elapsed = BigInt(
            Date.now() -
              account.accountTokenSnapshots[0].updatedAtTimestamp * 1000,
          );
          directTotal +=
            BigInt(
              account.accountTokenSnapshots[0]
                .totalAmountStreamedInUntilUpdatedAt,
            ) +
            (BigInt(account.accountTokenSnapshots[0].totalInflowRate) *
              elapsed) /
              BigInt(1000);
        }

        return directTotal;
      };

      clearInterval(directTotalTimerId.current);

      directTotalTimerId.current = setInterval(
        () => setDirectTotal(calcDirectTotal()),
        1000,
      );
    }

    return () => clearInterval(directTotalTimerId.current);
  }, [superfluidQueryRes, directTotalTimerId]);

  useEffect(() => {
    if (
      !recipients ||
      !superfluidQueryRes?.accounts ||
      !superfluidQueryRes?.pool
    ) {
      return;
    }

    if ((inView || granteesBatch.current === 1) && hasNextGrantee.current) {
      const grantees: Grantee[] = [];

      if (recipientId) {
        const recipient = recipients.find(
          (recipient: { id: string }) => recipient.id === recipientId,
        );
        if (recipient) {
          const grantee = getGrantee(recipient);

          grantees.push(grantee);
        }
      }

      for (
        let i = skipGrantees.current;
        i < GRANTEES_BATCH_SIZE * granteesBatch.current;
        i++
      ) {
        skipGrantees.current = i + 1;

        if (skipGrantees.current == recipients.length) {
          hasNextGrantee.current = false;
        }

        const recipient = recipients[i];

        if (recipient && recipient.id === recipientId) {
          continue;
        } else if (recipient) {
          grantees.push(getGrantee(recipient));
        } else {
          break;
        }
      }

      if (grantees.length >= GRANTEES_BATCH_SIZE * granteesBatch.current) {
        granteesBatch.current++;
      }

      setGrantees((prev) =>
        sortingMethod !== SortingMethod.RANDOM || granteesBatch.current <= 1
          ? sortGrantees(prev.concat(grantees))
          : prev.concat(grantees),
      );
    } else {
      setGrantees((prev) => {
        const grantees: Grantee[] = [];

        for (const i in prev) {
          const recipient = recipients.find(
            (recipient: { id: string }) => recipient.id === prev[i].id,
          );

          if (recipient) {
            grantees[i] = getGrantee(recipient);
          }
        }

        return grantees;
      });
    }
  }, [
    recipients,
    superfluidQueryRes,
    inView,
    getGrantee,
    sortingMethod,
    sortGrantees,
    recipientId,
  ]);

  useEffect(() => {
    setGrantees((prev) => sortGrantees(prev));
  }, [sortingMethod, sortGrantees]);

  useEffect(() => {
    if (!pool || !gdaPoolAddress) {
      return;
    }

    const {
      strategyAddress,
      allocationToken,
      matchingToken,
      metadata,
      chainId,
    } = pool;

    updateDonorParams({
      poolId,
      strategyAddress,
      gdaPoolAddress: gdaPoolAddress.toLowerCase(),
      chainId,
      allocationToken,
      matchingToken,
      nftMintUrl: metadata.nftMintUrl ?? null,
    });
  }, [pool, gdaPoolAddress, poolId, updateDonorParams]);

  useEffect(() => {
    if (recipientId && grantees.length > 0) {
      const granteeIndex = grantees.findIndex(
        (grantee) => grantee.id === recipientId,
      );

      if (granteeIndex >= 0) {
        setTransactionPanelState({
          show: true,
          isFundingMatchingPool: false,
          selectedGrantee: granteeIndex,
        });
      }
    } else if (editPoolDistribution) {
      setTransactionPanelState({
        show: true,
        isFundingMatchingPool: true,
        selectedGrantee: null,
      });
    }
  }, [recipientId, grantees, editPoolDistribution]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      postHog.startSessionRecording();
    }
  }, [postHog, postHog.decideEndpointWasHit]);

  return (
    <SuperfluidContextProvider
      network={network}
      matchingTokenInfo={matchingTokenInfo}
      allocationTokenInfo={allocationTokenInfo}
    >
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
        <PoolInfo
          name={pool?.metadata.name ?? "N/A"}
          description={pool?.metadata.description ?? "N/A"}
          chainId={chainId}
          gdaPoolAddress={gdaPoolAddress ?? "0x"}
          totalDistributionsCount={
            superfluidQueryRes?.pool.poolDistributors.filter(
              (distributor: { flowRate: string }) =>
                distributor.flowRate !== "0",
            ).length ?? 0
          }
          grantees={grantees}
          directFlowRate={
            superfluidQueryRes?.accounts
              ? superfluidQueryRes?.accounts
                  .map(
                    (account: {
                      accountTokenSnapshots: {
                        totalInflowRate: string;
                      }[];
                    }) =>
                      BigInt(account.accountTokenSnapshots[0].totalInflowRate),
                  )
                  .reduce((a: bigint, b: bigint) => a + b, BigInt(0))
              : BigInt(0)
          }
          directTotal={directTotal}
          allocationTokenInfo={allocationTokenInfo}
          matchingTokenInfo={matchingTokenInfo}
          directFunders={
            superfluidQueryRes?.accounts
              ? superfluidQueryRes?.accounts
                  .map(
                    (account: {
                      accountTokenSnapshots: {
                        activeIncomingStreamCount: number;
                      }[];
                    }) =>
                      account.accountTokenSnapshots[0]
                        .activeIncomingStreamCount,
                  )
                  .reduce((a: number, b: number) => a + b, 0)
              : 0
          }
          matchingPool={matchingPool}
          showTransactionPanel={() =>
            setTransactionPanelState({
              show: true,
              isFundingMatchingPool: true,
              selectedGrantee: null,
            })
          }
        />
        <Stack
          direction="horizontal"
          gap={4}
          className="px-4 pt-5 pb-4 pt-4 fs-4"
        >
          Grantees
          <Dropdown>
            <Dropdown.Toggle
              variant="transparent"
              className="d-flex justify-content-between align-items-center border border-2 border-gray"
              style={{ width: 156 }}
            >
              {sortingMethod}
            </Dropdown.Toggle>

            <Dropdown.Menu>
              <Dropdown.Item
                onClick={() => setSortingMethod(SortingMethod.RANDOM)}
              >
                {SortingMethod.RANDOM}
              </Dropdown.Item>
              <Dropdown.Item
                onClick={() => setSortingMethod(SortingMethod.ALPHABETICAL)}
              >
                {SortingMethod.ALPHABETICAL}
              </Dropdown.Item>
              <Dropdown.Item
                onClick={() => setSortingMethod(SortingMethod.POPULAR)}
              >
                {SortingMethod.POPULAR}
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </Stack>
        <div
          className="px-4 pb-5"
          style={{
            display: "grid",
            columnGap: "1.5rem",
            rowGap: "3rem",
            gridTemplateColumns: isTablet
              ? "repeat(2,minmax(0,1fr))"
              : isSmallScreen
                ? "repeat(3,minmax(0,1fr))"
                : isMediumScreen || isBigScreen
                  ? "repeat(4,minmax(0,1fr))"
                  : "",
          }}
        >
          {grantees.map((grantee: Grantee, i: number) => (
            <Grantee
              key={grantee.id}
              name={grantee.metadata.title}
              description={grantee.metadata.description}
              logoCid={grantee.metadata.logoImg}
              bannerCid={grantee.bannerCid}
              placeholderLogo={grantee.placeholderLogo}
              placeholderBanner={grantee.placeholderBanner}
              allocatorsCount={grantee.inflow.activeIncomingStreamCount}
              allocationFlowRate={BigInt(grantee.inflow.totalInflowRate ?? 0)}
              matchingFlowRate={grantee.matchingFlowRate}
              impactMatchingEstimate={grantee.impactMatchingEstimate}
              allocationTokenInfo={allocationTokenInfo}
              matchingTokenInfo={matchingTokenInfo}
              userFlowRate={
                grantee.userOutflow
                  ? BigInt(grantee.userOutflow.currentFlowRate)
                  : null
              }
              isSelected={transactionPanelState.selectedGrantee === i}
              selectGrantee={() =>
                setTransactionPanelState({
                  show: true,
                  isFundingMatchingPool: false,
                  selectedGrantee: i,
                })
              }
            />
          ))}
        </div>
        {hasNextGrantee.current === true && (
          <Stack direction="horizontal" className="justify-content-center">
            <Spinner ref={sentryRef}></Spinner>
          </Stack>
        )}
        {transactionPanelState.show &&
        transactionPanelState.isFundingMatchingPool ? (
          <MatchingPoolFunding
            show={transactionPanelState.show}
            handleClose={() =>
              setTransactionPanelState({
                show: false,
                isFundingMatchingPool: false,
                selectedGrantee: null,
              })
            }
            poolName={pool?.metadata.name ?? ""}
            poolUiLink={`${hostName}/pool/?poolId=${poolId}&chainId=${chainId}`}
            description={pool?.metadata.description ?? ""}
            matchingPool={matchingPool}
            matchingTokenInfo={matchingTokenInfo}
            network={network}
            receiver={gdaPoolAddress ?? ""}
            userAccountSnapshots={
              superfluidQueryRes?.account?.accountTokenSnapshots ?? null
            }
            shouldMintNft={!isEligible}
          />
        ) : transactionPanelState.show &&
          transactionPanelState.selectedGrantee !== null ? (
          <GranteeFunding
            show={transactionPanelState.show}
            handleClose={() =>
              setTransactionPanelState({
                show: false,
                isFundingMatchingPool: false,
                selectedGrantee: null,
              })
            }
            receiver={
              grantees[transactionPanelState.selectedGrantee].superappAddress
            }
            poolUiLink={`${hostName}/pool/?poolId=${poolId}&chainId=${chainId}&recipientId=${grantees[transactionPanelState.selectedGrantee].id}`}
            framesLink={`https://frames.flowstate.network/frames/grantee/${grantees[transactionPanelState.selectedGrantee].id}/${poolId}/${chainId}`}
            poolName={pool?.metadata.name ?? ""}
            metadata={grantees[transactionPanelState.selectedGrantee].metadata}
            placeholderLogo={
              grantees[transactionPanelState.selectedGrantee].placeholderLogo
            }
            twitter={grantees[transactionPanelState.selectedGrantee].twitter}
            farcaster={
              grantees[transactionPanelState.selectedGrantee].farcaster
            }
            recipientAddress={
              grantees[transactionPanelState.selectedGrantee].recipientAddress
            }
            inflow={grantees[transactionPanelState.selectedGrantee].inflow}
            userOutflow={
              grantees[transactionPanelState.selectedGrantee].userOutflow
            }
            flowRateToFlowState={flowRateToFlowState?.currentFlowRate ?? "0"}
            matchingPool={matchingPool}
            matchingFlowRate={
              grantees[transactionPanelState.selectedGrantee].matchingFlowRate
            }
            allocationTokenInfo={allocationTokenInfo}
            matchingTokenInfo={matchingTokenInfo}
            userAccountSnapshots={
              superfluidQueryRes?.account?.accountTokenSnapshots ?? null
            }
            isEligible={isEligible}
            network={network}
            requiredNftAddress={(requiredNftAddress as Address) ?? null}
            flowStateEligibility={pool?.metadata.flowStateEligibility ?? false}
            nftMintUrl={pool?.metadata.nftMintUrl ?? null}
            recipientId={grantees[transactionPanelState.selectedGrantee].id}
          />
        ) : null}
      </Container>
    </SuperfluidContextProvider>
  );
}
