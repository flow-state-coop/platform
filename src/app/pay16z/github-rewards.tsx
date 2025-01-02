"use client";

import { useState, useLayoutEffect, useEffect } from "react";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQuery, gql } from "@apollo/client";
import Papa from "papaparse";
import Container from "react-bootstrap/Container";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Table from "react-bootstrap/Table";
import Spinner from "react-bootstrap/Spinner";
import SuperfluidContextProvider from "@/context/Superfluid";
import MatchingPoolFunding from "@/components/MatchingPoolFunding";
import GithubRewardsModal from "@/components/GithubRewardsModal";
import { Token } from "@/types/token";
import { scoresCsvUrl } from "@/app/api/github-rewards/constants";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowingAmount from "@/hooks/flowingAmount";
import { getApolloClient } from "@/lib/apollo";
import { networks } from "@/lib/networks";
import { formatNumberWithCharSuffix } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

type GithubRewardsProps = {
  chainId: number;
};

type Score = {
  ["Github Username"]: string;
  ["Score"]: string;
  ["Commits"]: string;
  ["Pull Requests"]: string;
  ["Issues"]: string;
};

type Contributor = {
  name: string;
  image: string;
  score: number;
  commits: number;
  pullRequests: number;
  issues: number;
  flowRate: bigint;
  totalFlowed: bigint;
  estimatedFlowRate: bigint | null;
};

const GDA_POOL_QUERY = gql`
  query GdaPoolQuery($gdaPool: String!, $userAddress: String!) {
    pool(id: $gdaPool) {
      flowRate
      adjustmentFlowRate
      totalUnits
      totalAmountFlowedDistributedUntilUpdatedAt
      updatedAtTimestamp
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
      token {
        id
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
    }
  }
`;

export default function GithubRewards(props: GithubRewardsProps) {
  const { chainId } = props;

  const [showFullInfo, setShowFullInfo] = useState(true);
  const [showGithubRewardsModal, setShowGithubRewardsModal] = useState(false);
  const [transactionPanelState, setTransactionPanelState] = useState<{
    show: boolean;
    isFundingWithStream: boolean;
  }>({
    show: false,
    isFundingWithStream: false,
  });
  const [contributors, setContributors] = useState<Contributor[]>([]);

  const network =
    networks.find((network) => network.id === chainId) ?? networks[0];

  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { data: superfluidQueryRes } = useQuery(GDA_POOL_QUERY, {
    client: getApolloClient("superfluid", chainId),
    variables: {
      gdaPool: network.pay16zPool?.toLowerCase(),
      userAddress: address?.toLowerCase() ?? "0x",
    },
    pollInterval: 10000,
  });

  const hostName =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "";
  const pool = superfluidQueryRes?.pool;
  const token = network.tokens.find(
    (token: Token) => token.address.toLowerCase() === pool?.token.id,
  );
  const totalAmountFlowed = useFlowingAmount(
    BigInt(pool?.totalAmountFlowedDistributedUntilUpdatedAt ?? 0),
    pool?.updatedAtTimestamp ?? 0,
    BigInt(pool?.flowRate ?? 0),
  );

  useLayoutEffect(() => {
    if (!showFullInfo) {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  }, [showFullInfo]);

  useEffect(() => {
    (async () => {
      try {
        if (!pool) {
          return;
        }

        const contributors: Contributor[] = [];
        const scoresCsvRes = await fetch(scoresCsvUrl[network.id]);
        const scoresCsv = await scoresCsvRes.text();
        const scoresParsingResult = Papa.parse(scoresCsv, { header: true });
        const scores = scoresParsingResult.data as Score[];
        const contributorsRes = await fetch(
          "/api/github-rewards/contributors",
          {
            method: "POST",
            body: JSON.stringify({ chainId }),
          },
        );
        const { contributors: registeredContributors } =
          await contributorsRes.json();
        const adjustedFlowRate =
          BigInt(pool.flowRate) - BigInt(pool.adjustmentFlowRate);

        for (const score of scores) {
          let memberFlowRate = BigInt(0);
          let totalFlowed = BigInt(0);

          const registeredContributor = registeredContributors.find(
            (contributor: { name: string }) =>
              contributor.name === score["Github Username"],
          );
          const member = pool.poolMembers.find(
            (member: { account: { id: string } }) =>
              registeredContributor?.address.toLowerCase() ===
              member.account.id,
          );

          if (member) {
            memberFlowRate =
              BigInt(pool.totalUnits) > 0
                ? (BigInt(member?.units ?? 0) * adjustedFlowRate) /
                  BigInt(pool.totalUnits)
                : BigInt(0);
            const elapsedTimeInMilliseconds = BigInt(
              Date.now() - member.updatedAtTimestamp * 1000,
            );
            totalFlowed =
              memberFlowRate +
              (BigInt(pool.flowRate) * elapsedTimeInMilliseconds) /
                BigInt(1000);
          }

          const githubProfileRes = await fetch(
            `https://api.github.com/users/${score["Github Username"]}`,
          );

          const githubProfile = await githubProfileRes.json();

          await new Promise((resolve) =>
            setTimeout(
              resolve,
              process.env.NODE_ENV === "production" ? 10 : 200,
            ),
          );

          contributors.push({
            name: score["Github Username"],
            image: githubProfile?.avatar_url ?? "",
            score: Number(score["Score"]),
            commits: Number(score["Commits"]),
            pullRequests: Number(score["Pull Requests"]),
            issues: Number(score["Issues"]),
            flowRate: memberFlowRate,
            totalFlowed: totalFlowed,
            estimatedFlowRate: member
              ? null
              : (BigInt(score["Score"]) * adjustedFlowRate) /
                (BigInt(pool.totalUnits) + BigInt(score["Score"])),
          });
        }

        setContributors(contributors);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [pool, chainId, network]);

  return (
    <SuperfluidContextProvider
      network={network}
      matchingTokenInfo={token ?? network.tokens[0]}
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
        {!pool ? (
          <Stack
            direction="horizontal"
            className="mb-5 pb-5 align-items-center justify-content-center"
            style={{ height: "100svh" }}
          >
            <Spinner />
          </Stack>
        ) : (
          <>
            <div className="px-4 pt-5 pool-info-background">
              <Stack direction="vertical" className="pb-4">
                <Stack
                  direction="horizontal"
                  className="justify-content-between"
                >
                  <Stack direction="horizontal" gap={1}>
                    <Card.Text className="m-0 fs-4 fw-bold">ai16z</Card.Text>
                  </Stack>
                  {isMobile && !showFullInfo && (
                    <Button
                      variant="transparent"
                      className="p-0"
                      onClick={() => setShowFullInfo(true)}
                    >
                      <Image src="/expand-more.svg" alt="toggle" width={48} />
                    </Button>
                  )}
                </Stack>
                <Card.Text className="mb-4 fs-6">
                  Continuous Retro Funding
                </Card.Text>
                {(!isMobile || showFullInfo) && (
                  <>
                    <Table borderless>
                      <thead className="border-bottom border-dark">
                        <tr>
                          <th className="w-33 ps-0 bg-transparent text-dark">
                            {isMobile ? "Token" : "Funding Token"}
                          </th>
                          <th className="w-20 bg-transparent text-dark">
                            {isMobile ? "Monthly" : "Monthly Flow"}
                          </th>
                          <th className="w-20 bg-transparent text-dark">
                            {isMobile ? "Total" : "Total Flow"}
                          </th>
                          <th className="w-20 bg-transparent text-dark">
                            Recipients
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="w-33 ps-0 bg-transparent">
                            {token?.name ?? "N/A"}
                          </td>
                          <td className="w-20 bg-transparent">
                            {formatNumberWithCharSuffix(
                              Number(
                                formatEther(
                                  BigInt(pool.flowRate) *
                                    BigInt(SECONDS_IN_MONTH),
                                ),
                              ),
                              0,
                            )}
                          </td>
                          <td className="w-20 bg-transparent">
                            {formatNumberWithCharSuffix(
                              Number(formatEther(totalAmountFlowed)),
                              4,
                            )}
                          </td>
                          <td className="w-20 bg-transparent">
                            {
                              pool.poolMembers.filter(
                                (member: { units: string }) =>
                                  member.units !== "0",
                              ).length
                            }
                          </td>
                        </tr>
                      </tbody>
                    </Table>
                    <Stack
                      direction={isMobile ? "vertical" : "horizontal"}
                      gap={4}
                      className="justify-content-end w-100 mt-3"
                    >
                      <Button
                        variant="secondary"
                        className="p-2 text-light fs-5"
                        style={{ width: isMobile ? "100%" : 180 }}
                        onClick={() =>
                          setTransactionPanelState({
                            show: true,
                            isFundingWithStream: true,
                          })
                        }
                      >
                        Stream {token?.name ?? "N/A"}
                      </Button>
                      <Button
                        variant="primary"
                        disabled={network.name !== "Base"}
                        className="p-2 text-light fs-5"
                        style={{ width: isMobile ? "100%" : 180 }}
                        onClick={() => () =>
                          setTransactionPanelState({
                            show: true,
                            isFundingWithStream: false,
                          })
                        }
                      >
                        Donate with ETH
                      </Button>
                    </Stack>
                  </>
                )}
                {isMobile && showFullInfo && (
                  <Button
                    variant="transparent"
                    className="p-0 ms-auto mt-5"
                    onClick={() => setShowFullInfo(false)}
                  >
                    <Image src="/expand-less.svg" alt="toggle" width={48} />
                  </Button>
                )}
              </Stack>
            </div>
            <p className="p-4 pb-1 fs-4">Github Contributors</p>
            {contributors.length > 0 ? (
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
                {contributors.map((contributor, i) => (
                  <Card
                    key={i}
                    className="rounded-4 overflow-hidden shadow border-light"
                    style={{
                      height: 250,
                      border: "1px solid #212529",
                    }}
                  >
                    <Card.Header className="d-flex gap-3 align-items-start mt-1 bg-transparent border-0">
                      <Image
                        src={contributor.image}
                        alt=""
                        width={32}
                        height={32}
                        className="rounded-circle mt-1"
                      />
                      <Stack direction="vertical" className="overflow-hidden">
                        <Card.Text className="m-0 fw-bold text-truncate">
                          {contributor.name}
                        </Card.Text>
                        <Card.Text className="m-0 small text-info">
                          {contributor.commits} Commits
                        </Card.Text>
                      </Stack>
                      <span
                        className="w-33 rounded-4 px-2 py-1 small text-center text-nowrap"
                        style={{ background: "#dcebfc", color: "#2c4cb5" }}
                      >
                        Score {contributor.score}
                      </span>
                    </Card.Header>
                    <Card.Body className="pt-2">
                      <Stack
                        direction="horizontal"
                        className="justify-content-between text-info fs-6"
                      >
                        <Card.Text className="m-0">
                          {contributor.commits} Commits
                        </Card.Text>
                        <Card.Text className="m-0">
                          {contributor.pullRequests} PRs
                        </Card.Text>
                        <Card.Text className="m-0">
                          {contributor.issues} Issues
                        </Card.Text>
                      </Stack>
                    </Card.Body>
                    <Card.Footer className="bg-transparent border-0 pb-3">
                      <Stack
                        direction="horizontal"
                        className="justify-content-between"
                      >
                        {contributor.estimatedFlowRate === null ? (
                          <>
                            <Stack direction="vertical" gap={2}>
                              <Card.Text className="m-0 text-center small fw-bold">
                                Current Stream
                              </Card.Text>
                              <Card.Text className="m-0 text-center small">
                                {formatNumberWithCharSuffix(
                                  Number(
                                    formatEther(
                                      contributor.flowRate *
                                        BigInt(SECONDS_IN_MONTH),
                                    ),
                                  ),
                                  3,
                                )}{" "}
                                {token?.name ?? "N/A"}/mo
                              </Card.Text>
                            </Stack>
                            <Stack direction="vertical" gap={2}>
                              <Card.Text className="m-0 text-center small fw-bold">
                                Total
                              </Card.Text>
                              <Card.Text className="m-0 text-center small">
                                {formatNumberWithCharSuffix(
                                  Number(formatEther(contributor.totalFlowed)),
                                  3,
                                )}{" "}
                                {token?.name ?? "N/A"}
                              </Card.Text>
                            </Stack>
                          </>
                        ) : (
                          <Stack
                            direction="vertical"
                            className="align-items-center"
                          >
                            <Button
                              variant="transparent"
                              className="mb-2 text-decoration-underline fs-4"
                              onClick={
                                !address
                                  ? openConnectModal
                                  : () => setShowGithubRewardsModal(true)
                              }
                            >
                              Profile Not Claimed
                            </Button>
                            <Card.Text className="m-0 fw-bold">
                              Missing out on
                            </Card.Text>
                            <Card.Text>
                              {formatNumberWithCharSuffix(
                                Number(
                                  formatEther(
                                    contributor.estimatedFlowRate *
                                      BigInt(SECONDS_IN_MONTH),
                                  ),
                                ),
                                3,
                              )}{" "}
                              {token?.name ?? "N/A"}/mo
                            </Card.Text>
                          </Stack>
                        )}
                      </Stack>
                    </Card.Footer>
                  </Card>
                ))}
              </div>
            ) : (
              <Stack direction="horizontal" className="justify-content-center">
                <Spinner />
              </Stack>
            )}
            {transactionPanelState.show &&
            transactionPanelState.isFundingWithStream ? (
              <MatchingPoolFunding
                show={transactionPanelState.show}
                handleClose={() =>
                  setTransactionPanelState({
                    show: false,
                    isFundingWithStream: false,
                  })
                }
                poolName="Pay16z"
                poolUiLink={`${hostName}/pay16z/?&chainId=${chainId}`}
                description="ai16z Continous Retro Funding"
                matchingPool={pool}
                matchingTokenInfo={token ?? network.tokens[0]}
                network={network}
                receiver={network.pay16zPool ?? ""}
                userAccountSnapshots={
                  superfluidQueryRes?.account?.accountTokenSnapshots ?? null
                }
                shouldMintNft={false}
                isFundingFlowSplitter={true}
              />
            ) : null}
          </>
        )}
        {showGithubRewardsModal && (
          <GithubRewardsModal
            showModal={showGithubRewardsModal}
            closeModal={() => setShowGithubRewardsModal(false)}
          />
        )}
      </Container>
    </SuperfluidContextProvider>
  );
}
