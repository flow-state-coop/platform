import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import { GetServerSideProps } from "next";
import { useQuery, gql } from "@apollo/client";
import { parseEther, Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { useInView } from "react-intersection-observer";
import Container from "react-bootstrap/Container";
import Stack from "react-bootstrap/Stack";
import Dropdown from "react-bootstrap/Dropdown";
import Spinner from "react-bootstrap/Spinner";
import SuperfluidContextProvider from "@/context/Superfluid";
import PoolInfo from "@/components/PoolInfo";
import Grantee from "@/components/Grantee";
import GranteeFunding from "@/components/GranteeFunding";
import MatchingPoolFunding from "@/components/MatchingPoolFunding";
import { Recipient } from "@/types/recipient";
import { Token } from "@/types/token";
import { Inflow } from "@/types/inflow";
import { Outflow } from "@/types/outflow";
import { strategyAbi } from "@/lib/abi/strategy";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useDonorParams from "@/hooks/donorParams";
import { passportDecoderAbi } from "@/lib/abi/passportDecoder";
import { erc721CheckerAbi } from "@/lib/abi/erc721Checker";
import { erc721Abi } from "@/lib/abi/erc721";
import { networks } from "@/lib/networks";
import { getApolloClient } from "@/lib/apollo";
import { calcMatchingImpactEstimate } from "@/lib/matchingImpactEstimate";
import { shuffle } from "@/lib/utils";
import { SECONDS_IN_MONTH, ZERO_ADDRESS } from "@/lib/constants";

type IndexProps = {
  hostName: string;
  poolId: string;
  chainId: string;
  recipientId: string;
};

type Grantee = {
  id: string;
  recipientAddress: string;
  superappAddress: string;
  name: string;
  description: string;
  logoCid: string;
  bannerCid: string;
  twitter: string;
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

enum EligibilityMethod {
  PASSPORT,
  NFT_GATING,
}

const POOL_QUERY = gql`
  query PoolQuery($poolId: String!, $chainId: Int!) {
    pool(chainId: $chainId, id: $poolId) {
      metadata
      strategyAddress
      matchingToken
      allocationToken
      chainId
      recipientsByPoolIdAndChainId(condition: { status: APPROVED }) {
        id
        recipientAddress
        metadata
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

const DEFAULT_POOL_ID = "45";
const DEFAULT_CHAIN_ID = 11155420;
const GRANTEES_BATCH_SIZE = 20;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { req, query } = ctx;

  return {
    props: {
      hostName: req.headers.host,
      poolId: query.poolid ?? null,
      chainId: query.chainid ?? null,
      recipientId: query.recipientid ?? null,
    },
  };
};

export default function Index(props: IndexProps) {
  const { hostName, poolId, chainId, recipientId } = props;

  const [grantees, setGrantees] = useState<Grantee[]>([]);
  const [directTotal, setDirectTotal] = useState(BigInt(0));
  const [sortingMethod, setSortingMethod] = useState(SortingMethod.RANDOM);
  const [transactionPanelState, setTransactionPanelState] = useState<{
    show: boolean;
    isFundingMatchingPool: boolean;
    selectedGrantee: Grantee | null;
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
  const { data: streamingFundQueryRes } = useQuery(POOL_QUERY, {
    client: getApolloClient("streamingfund"),
    variables: {
      poolId: poolId ?? DEFAULT_POOL_ID,
      chainId: chainId ? Number(chainId) : DEFAULT_CHAIN_ID,
    },
  });
  const { data: gdaPoolAddress } = useReadContract({
    address: streamingFundQueryRes?.pool?.strategyAddress,
    abi: strategyAbi,
    functionName: "gdaPool",
    chainId: chainId ? Number(chainId) : DEFAULT_CHAIN_ID,
  });
  const { data: superfluidQueryRes } = useQuery(STREAM_QUERY, {
    client: getApolloClient(
      "superfluid",
      chainId ? Number(chainId) : DEFAULT_CHAIN_ID,
    ),
    variables: {
      superapps:
        streamingFundQueryRes?.pool?.recipientsByPoolIdAndChainId?.map(
          (recipient: { superappAddress: string }) => recipient.superappAddress,
        ) ?? [],
      gdaPool: gdaPoolAddress?.toLowerCase(),
      userAddress: address?.toLowerCase() ?? "0x",
      token: streamingFundQueryRes?.pool?.allocationToken ?? "0x",
    },
    pollInterval: 10000,
  });
  const { data: passportDecoder } = useReadContract({
    address: streamingFundQueryRes?.pool?.strategyAddress,
    abi: strategyAbi,
    functionName: "passportDecoder",
    chainId: chainId ? Number(chainId) : DEFAULT_CHAIN_ID,
  });
  const { data: minPassportScore } = useReadContract({
    address: streamingFundQueryRes?.pool?.strategyAddress,
    abi: strategyAbi,
    functionName: "minPassportScore",
    chainId: chainId ? Number(chainId) : DEFAULT_CHAIN_ID,
  });
  const { data: passportScore, refetch: refetchPassportScore } =
    useReadContract({
      abi: passportDecoderAbi,
      address: passportDecoder ?? "0x",
      functionName: "getScore",
      args: [address ?? "0x"],
      chainId: chainId ? Number(chainId) : DEFAULT_CHAIN_ID,
      query: {
        enabled: address && passportDecoder !== ZERO_ADDRESS ? true : false,
      },
    });
  const { data: eligibilityMethod } = useReadContract({
    address: streamingFundQueryRes?.pool?.strategyAddress,
    abi: strategyAbi,
    functionName: "getAllocationEligiblity",
    chainId: chainId ? Number(chainId) : DEFAULT_CHAIN_ID,
  });
  const { data: nftChecker } = useReadContract({
    address: streamingFundQueryRes?.pool?.strategyAddress,
    abi: strategyAbi,
    functionName: "checker",
    query: { enabled: eligibilityMethod === EligibilityMethod.NFT_GATING },
    chainId: chainId ? Number(chainId) : DEFAULT_CHAIN_ID,
  });
  const { data: requiredNftAddress } = useReadContract({
    address: nftChecker,
    abi: erc721CheckerAbi,
    functionName: "erc721",
    query: { enabled: nftChecker && nftChecker !== ZERO_ADDRESS },
    chainId: chainId ? Number(chainId) : DEFAULT_CHAIN_ID,
  });
  const { data: nftBalance } = useReadContract({
    address: requiredNftAddress as Address,
    abi: erc721Abi,
    functionName: "balanceOf",
    args: [address ?? "0x"],
    chainId: chainId ? Number(chainId) : DEFAULT_CHAIN_ID,
    query: {
      enabled: !!address && !!requiredNftAddress,
      refetchInterval: 10000,
    },
  });

  const pool = streamingFundQueryRes?.pool ?? null;
  const matchingPool = superfluidQueryRes?.pool ?? null;
  const network = networks.find(
    (network) => network.id === Number(chainId ?? DEFAULT_CHAIN_ID),
  );
  const isEligible =
    eligibilityMethod === EligibilityMethod.NFT_GATING && !!nftBalance
      ? true
      : eligibilityMethod === EligibilityMethod.PASSPORT &&
          passportScore &&
          minPassportScore &&
          passportScore >= minPassportScore
        ? true
        : false;

  const allocationTokenInfo = useMemo(
    () =>
      network?.tokens.find(
        (token) => pool?.allocationToken === token.address.toLowerCase(),
      ) ?? { name: "N/A", address: pool?.allocationToken ?? "", icon: "" },
    [network, pool],
  );
  const matchingTokenInfo = useMemo(
    () =>
      network?.tokens.find(
        (token) => pool?.matchingToken === token.address.toLowerCase(),
      ) ?? { name: "N/A", address: pool?.matchingToken ?? "", icon: "" },
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
          ? (BigInt(member.units) * adjustedFlowRate) /
            BigInt(matchingPool.totalUnits)
          : BigInt(0);
      const impactMatchingEstimate = calcMatchingImpactEstimate({
        totalFlowRate: BigInt(matchingPool.flowRate ?? 0),
        totalUnits: BigInt(matchingPool.totalUnits ?? 0),
        granteeUnits: BigInt(member.units),
        granteeFlowRate: memberFlowRate,
        previousFlowRate: BigInt(0),
        newFlowRate: parseEther("1") / BigInt(SECONDS_IN_MONTH),
      });

      return {
        id: recipient.id,
        recipientAddress: recipient.recipientAddress,
        superappAddress: recipient.superappAddress,
        name: recipient.metadata.title,
        description: recipient.metadata.description,
        logoCid: recipient.metadata.logoImg,
        bannerCid: recipient.metadata.bannerImg,
        twitter: recipient.metadata.projectTwitter,
        inflow: superappAccount.accountTokenSnapshots[0],
        matchingFlowRate: memberFlowRate ?? BigInt(0),
        impactMatchingEstimate,
        allocationTokenInfo,
        matchingTokenInfo,
        userOutflow:
          userOutflow && userOutflow.currentFlowRate !== "0"
            ? userOutflow
            : null,
        placeholderLogo: `/placeholders/${Math.floor(Math.random() * (5 - 1 + 1) + 1)}.jpg`,
        placeholderBanner: `/placeholders/${Math.floor(Math.random() * (5 - 1 + 1) + 1)}.jpg`,
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
          if (a.name < b.name) {
            return -1;
          }

          if (a.name > b.name) {
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
    if (
      !streamingFundQueryRes?.pool ||
      !superfluidQueryRes?.accounts ||
      !superfluidQueryRes?.pool
    ) {
      return;
    }

    if (inView && hasNextGrantee.current) {
      const grantees: Grantee[] = [];

      if (recipientId) {
        const recipient =
          streamingFundQueryRes.pool.recipientsByPoolIdAndChainId.find(
            (recipient: { id: string }) => recipient.id === recipientId,
          );

        if (recipient) {
          const grantee = getGrantee(recipient);
          grantees.push(grantee);

          setTransactionPanelState({
            show: true,
            isFundingMatchingPool: false,
            selectedGrantee: grantee,
          });
        }
      }

      for (
        let i = skipGrantees.current;
        i < GRANTEES_BATCH_SIZE * granteesBatch.current;
        i++
      ) {
        skipGrantees.current = i + 1;

        if (
          skipGrantees.current ==
          streamingFundQueryRes.pool.recipientsByPoolIdAndChainId.length
        ) {
          hasNextGrantee.current = false;
        }

        const recipient =
          streamingFundQueryRes.pool.recipientsByPoolIdAndChainId[i];

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
        sortingMethod !== SortingMethod.RANDOM
          ? sortGrantees(prev.concat(grantees))
          : prev.concat(grantees),
      );
    } else {
      setGrantees((prev) => {
        const grantees: Grantee[] = [];

        for (const recipient of streamingFundQueryRes.pool
          .recipientsByPoolIdAndChainId) {
          if (prev.find((grantee) => grantee.id === recipient.id)) {
            grantees.push(getGrantee(recipient));
          }
        }

        return grantees;
      });
    }
  }, [
    streamingFundQueryRes,
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
    if (!pool) {
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
      strategyAddress,
      chainId,
      allocationToken,
      matchingToken,
      nftMintUrl: metadata.nftMintUrl ?? null,
    });
  }, [pool, updateDonorParams]);

  return (
    <SuperfluidContextProvider
      network={network}
      matchingTokenInfo={matchingTokenInfo}
      allocationTokenInfo={allocationTokenInfo}
    >
      <Container
        className="mx-auto p-0"
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
              key={i}
              name={grantee.name}
              description={grantee.description}
              logoCid={grantee.logoCid}
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
              isSelected={
                transactionPanelState.selectedGrantee?.id === grantee.id
              }
              selectGrantee={() =>
                setTransactionPanelState({
                  show: true,
                  isFundingMatchingPool: false,
                  selectedGrantee: grantee,
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
            poolUiLink={`https://${hostName}/?poolid=${poolId ?? DEFAULT_POOL_ID}&chainid=${chainId ?? DEFAULT_CHAIN_ID}`}
            description={pool?.metadata.description ?? ""}
            matchingPool={matchingPool}
            matchingTokenInfo={matchingTokenInfo}
            network={network}
            receiver={gdaPoolAddress ?? ""}
            userAccountSnapshots={
              superfluidQueryRes?.account?.accountTokenSnapshots ?? null
            }
          />
        ) : transactionPanelState.show &&
          transactionPanelState.selectedGrantee ? (
          <GranteeFunding
            show={transactionPanelState.show}
            handleClose={() =>
              setTransactionPanelState({
                show: false,
                isFundingMatchingPool: false,
                selectedGrantee: null,
              })
            }
            receiver={transactionPanelState.selectedGrantee.superappAddress}
            poolUiLink={`https://${hostName}/?poolid=${poolId ?? DEFAULT_POOL_ID}&chainid=${chainId ?? DEFAULT_CHAIN_ID}&recipientid=${transactionPanelState.selectedGrantee.id}`}
            framesLink={`https://frames.flowstate.network/frames/grantee/${transactionPanelState.selectedGrantee.id}/${poolId ?? DEFAULT_POOL_ID}/${chainId ?? DEFAULT_CHAIN_ID}`}
            poolName={pool?.metadata.name ?? ""}
            name={transactionPanelState.selectedGrantee.name ?? ""}
            description={
              transactionPanelState.selectedGrantee.description ?? ""
            }
            logoCid={transactionPanelState.selectedGrantee.logoCid}
            placeholderLogo={
              transactionPanelState.selectedGrantee.placeholderLogo
            }
            twitter={transactionPanelState.selectedGrantee.twitter}
            recipientAddress={
              transactionPanelState.selectedGrantee.recipientAddress
            }
            inflow={transactionPanelState.selectedGrantee.inflow}
            userOutflow={transactionPanelState.selectedGrantee.userOutflow}
            matchingPool={matchingPool}
            matchingFlowRate={
              transactionPanelState.selectedGrantee.matchingFlowRate
            }
            allocationTokenInfo={allocationTokenInfo}
            matchingTokenInfo={matchingTokenInfo}
            userAccountSnapshots={
              superfluidQueryRes?.account?.accountTokenSnapshots ?? null
            }
            isEligible={isEligible}
            network={network}
            passportScore={passportScore}
            refetchPassportScore={refetchPassportScore}
            passportDecoder={passportDecoder}
            minPassportScore={minPassportScore}
            requiredNftAddress={(requiredNftAddress as Address) ?? null}
            nftMintUrl={streamingFundQueryRes?.pool.metadata.nftMintUrl ?? null}
          />
        ) : null}
      </Container>
    </SuperfluidContextProvider>
  );
}
