import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useDisconnect, useReadContract } from "wagmi";
import { formatEther, Address } from "viem";
import { useQuery, gql } from "@apollo/client";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import advancedFormat from "dayjs/plugin/advancedFormat";
import Offcanvas from "react-bootstrap/Offcanvas";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Badge from "react-bootstrap/Badge";
import Spinner from "react-bootstrap/Spinner";
import PassportMintingInstructions from "./PassportMintingInstructions";
import StreamDeletionModal from "@/app/pool/components/StreamDeletionModal";
import useDonorParams from "@/hooks/donorParams";
import useSuperTokenBalanceOfNow from "@/hooks/superTokenBalanceOfNow";
import useFlowingAmount from "@/hooks/flowingAmount";
import { networks } from "@/lib/networks";
import { getApolloClient } from "@/lib/apollo";
import { passportDecoderAbi } from "@/lib/abi/passportDecoder";
import { strategyAbi } from "@/lib/abi/strategy";
import { erc721CheckerAbi } from "@/lib/abi/erc721Checker";
import { erc721Abi } from "@/lib/abi/erc721";
import {
  roundWeiAmount,
  formatNumberWithCommas,
  truncateStr,
} from "@/lib/utils";
import {
  ZERO_ADDRESS,
  SECONDS_IN_MONTH,
  DEFAULT_CHAIN_ID,
  FLOW_STATE_RECEIVER,
} from "@/lib/constants";

enum Token {
  ALLOCATION,
  MATCHING,
}

enum EligibilityMethod {
  PASSPORT,
  NFT_GATING,
}

enum MintError {
  FAIL = "There was an error minting the NFT. Please try again later.",
}

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(advancedFormat);

const FLOW_STATE_POOL_QUERY = gql`
  query PoolQuery($poolId: String!, $chainId: Int!) {
    pool(chainId: $chainId, id: $poolId) {
      recipientsByPoolIdAndChainId(
        first: 1000
        condition: { status: APPROVED }
      ) {
        id
        superappAddress
        metadata
      }
    }
  }
`;

const ACCOUNT_QUERY = gql`
  query AccountQuery(
    $userAddress: String!
    $allocationToken: String!
    $receivers: [String]
    $gdaPoolAddress: String!
  ) {
    account(id: $userAddress) {
      id
      accountTokenSnapshots {
        totalNetFlowRate
        totalOutflowRate
        maybeCriticalAtTimestamp
        token {
          id
        }
      }
      outflows(
        where: {
          token: $allocationToken
          receiver_: { id_in: $receivers }
          currentFlowRate_not: "0"
        }
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
    poolDistributors(
      where: {
        account_: { id: $userAddress }
        pool_: { id: $gdaPoolAddress }
        flowRate_not: "0"
      }
    ) {
      id
      flowRate
    }
  }
`;

export default function WalletBalance() {
  const [showOffcanvas, setShowOffcanvas] = useState(false);
  const [showMintingInstructions, setShowMintingInstructions] = useState(false);
  const [streamDeletionModalState, setStreamDeletionModalState] = useState({
    show: false,
    isMatchingPool: false,
    receiver: "",
  });
  const [token, setToken] = useState(Token.ALLOCATION);
  const [isLoadingNftMint, setIsLoadingNftMint] = useState(false);
  const [errorNftMint, setErrorNftMint] = useState("");

  const router = useRouter();
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const {
    poolId,
    strategyAddress,
    gdaPoolAddress,
    chainId,
    allocationToken,
    matchingToken,
    nftMintUrl,
  } = useDonorParams();
  const { data: flowStateQueryRes } = useQuery(FLOW_STATE_POOL_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      poolId,
      chainId,
    },
    pollInterval: 10000,
  });
  const { data: superfluidQueryRes } = useQuery(ACCOUNT_QUERY, {
    client: getApolloClient("superfluid", chainId ?? void 0),
    variables: {
      userAddress: address?.toLowerCase() ?? "0x",
      allocationToken: allocationToken?.toLowerCase() ?? "0x",
      receivers: [FLOW_STATE_RECEIVER].concat(
        flowStateQueryRes?.pool.recipientsByPoolIdAndChainId.map(
          (recipient: { superappAddress: string }) => recipient.superappAddress,
        ) ?? [],
      ),
      gdaPoolAddress,
    },
    skip: !poolId || !flowStateQueryRes || !address || !allocationToken,
    pollInterval: 10000,
  });
  const { data: eligibilityMethod } = useReadContract({
    address: strategyAddress as Address,
    abi: strategyAbi,
    functionName: "getAllocationEligiblity",
    chainId: chainId ?? void 0,
    query: { enabled: !!strategyAddress && !!chainId },
  });
  const { data: passportDecoder } = useReadContract({
    address: strategyAddress as Address,
    abi: strategyAbi,
    functionName: "passportDecoder",
    chainId: chainId ?? void 0,
    query: {
      enabled:
        !!strategyAddress &&
        !!chainId &&
        eligibilityMethod === EligibilityMethod.PASSPORT,
    },
  });
  const { data: minPassportScore } = useReadContract({
    address: strategyAddress as Address,
    abi: strategyAbi,
    functionName: "minPassportScore",
    chainId: chainId ?? void 0,
    query: {
      enabled:
        !!strategyAddress &&
        !!chainId &&
        eligibilityMethod === EligibilityMethod.PASSPORT,
    },
  });
  const { data: passportScore, refetch: refetchPassportScore } =
    useReadContract({
      abi: passportDecoderAbi,
      address: passportDecoder ?? "0x",
      functionName: "getScore",
      args: [address ?? "0x"],
      chainId: chainId ?? void 0,
      query: {
        enabled: address && passportDecoder !== ZERO_ADDRESS ? true : false,
      },
    });
  const { data: nftChecker } = useReadContract({
    address: strategyAddress as Address,
    abi: strategyAbi,
    functionName: "checker",
    chainId: chainId ?? void 0,
    query: { enabled: eligibilityMethod === EligibilityMethod.NFT_GATING },
  });
  const { data: requiredNftAddress } = useReadContract({
    address: nftChecker,
    abi: erc721CheckerAbi,
    functionName: "erc721",
    chainId: chainId ?? void 0,
    query: { enabled: nftChecker && nftChecker !== ZERO_ADDRESS },
  });
  const { data: nftBalance } = useReadContract({
    address: requiredNftAddress as Address,
    abi: erc721Abi,
    functionName: "balanceOf",
    args: [address ?? "0x"],
    chainId: chainId ?? void 0,
    query: {
      enabled: !!address && !!requiredNftAddress,
      refetchInterval: 10000,
    },
  });

  const network =
    networks.find((network) => network.id === chainId) ?? networks[0];
  const accountTokenSnapshotAllocation =
    superfluidQueryRes?.account?.accountTokenSnapshots?.filter(
      (snapshot: { token: { id: string } }) =>
        snapshot.token.id === allocationToken?.toLowerCase(),
    )[0];
  const accountTokenSnapshotMatching =
    superfluidQueryRes?.account?.accountTokenSnapshots?.filter(
      (snapshot: { token: { id: string } }) =>
        snapshot.token.id === matchingToken?.toLowerCase(),
    )[0];
  const {
    balanceUntilUpdatedAt: balanceUntilUpdatedAtAllocation,
    updatedAtTimestamp: updatedAtTimestampAllocation,
  } = useSuperTokenBalanceOfNow({
    token: allocationToken ?? "",
    address: address ?? "",
    chainId: chainId ?? DEFAULT_CHAIN_ID,
  });
  const {
    balanceUntilUpdatedAt: balanceUntilUpdatedAtMatching,
    updatedAtTimestamp: updatedAtTimestampMatching,
  } = useSuperTokenBalanceOfNow({
    token: matchingToken ?? "",
    address: address ?? "",
    chainId: chainId ?? DEFAULT_CHAIN_ID,
  });
  const superTokenBalanceAllocation = useFlowingAmount(
    BigInt(balanceUntilUpdatedAtAllocation ?? 0),
    updatedAtTimestampAllocation ?? 0,
    BigInt(accountTokenSnapshotAllocation?.totalNetFlowRate ?? 0),
  );
  const superTokenBalanceMatching = useFlowingAmount(
    BigInt(balanceUntilUpdatedAtMatching ?? 0),
    updatedAtTimestampMatching ?? 0,
    BigInt(accountTokenSnapshotMatching?.totalNetFlowRate ?? 0),
  );

  const allocationTokenInfo = useMemo(
    () =>
      network?.tokens.find(
        (token) => allocationToken === token.address.toLowerCase(),
      ) ?? { name: "N/A", address: allocationToken ?? "", icon: "" },
    [network, allocationToken],
  );
  const matchingTokenInfo = useMemo(
    () =>
      network?.tokens.find(
        (token) => matchingToken === token.address.toLowerCase(),
      ) ?? { name: "N/A", address: matchingToken ?? "", icon: "" },
    [network, matchingToken],
  );

  const handleNftMintRequest = async () => {
    try {
      setIsLoadingNftMint(true);
      setErrorNftMint("");

      const res = await fetch("/api/mint-nft", {
        method: "POST",
        body: JSON.stringify({
          address,
          chainId: network?.id ?? DEFAULT_CHAIN_ID,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();

      if (!data.success) {
        setErrorNftMint(MintError.FAIL);
      }

      setIsLoadingNftMint(false);

      console.info(data);
    } catch (err) {
      setIsLoadingNftMint(false);
      setErrorNftMint(MintError.FAIL);

      console.error(err);
    }
  };

  const handleCloseOffcanvas = () => setShowOffcanvas(false);
  const handleShowOffcanvas = () => setShowOffcanvas(true);

  return (
    <>
      <Button
        variant="transparent"
        disabled={showOffcanvas}
        onClick={handleShowOffcanvas}
        className="d-none d-sm-block border rounded-start shadow"
      >
        {!superfluidQueryRes ? (
          <Spinner size="sm" animation="border" role="status"></Spinner>
        ) : (
          <Stack direction="horizontal" gap={2} className="align-items-center">
            <Image src="/wallet.svg" alt="Wallet" width={22} height={22} />
            <Card.Text className="m-0">
              {formatEther(superTokenBalanceAllocation).slice(0, 8)}{" "}
              {allocationTokenInfo?.name}
            </Card.Text>
          </Stack>
        )}
      </Button>
      <Button
        variant="transparent"
        disabled={showOffcanvas}
        onClick={handleShowOffcanvas}
        className="d-sm-none border"
      >
        <Image width={22} height={22} src="/wallet.svg" alt="Account" />
      </Button>
      <Offcanvas
        show={showOffcanvas}
        scroll
        onHide={handleCloseOffcanvas}
        placement="end"
        backdrop={true}
        className="overflow-auto border-0"
      >
        <Stack
          direction="horizontal"
          className="justify-content-end align-items-center"
        >
          <Button
            variant="transparent"
            className="float-end"
            onClick={handleCloseOffcanvas}
          >
            <Image src="/close.svg" alt="close" width={28} />
          </Button>
        </Stack>
        <Stack
          direction="horizontal"
          className="justify-content-between align-items-center px-3 py-2"
        >
          <Stack direction="horizontal" className="align-items-center">
            <Card.Text className="m-0 sensitive">
              {truncateStr(address ?? "0x", 14)}{" "}
            </Card.Text>
            <Button
              variant="transparent"
              className="d-flex align-items-center px-1"
              onClick={() => navigator.clipboard.writeText(address ?? "0x")}
            >
              <Image
                src="/copy.svg"
                alt="Copy"
                width={18}
                style={{
                  filter:
                    "brightness(0) saturate(100%) invert(0%) sepia(100%) saturate(7460%) hue-rotate(59deg) brightness(105%) contrast(111%)",
                }}
              />
            </Button>
          </Stack>
          <Button
            variant="transparent"
            className="d-flex gap-2 align-items-center bg-light rounded-3 px-3 py-2"
            onClick={() => {
              disconnect();
              handleCloseOffcanvas();
            }}
          >
            <Card.Text className="m-0">Disconnect</Card.Text>
            <Image src="/logout.svg" alt="Logout" width={18} />{" "}
          </Button>
        </Stack>
        {superfluidQueryRes?.poolDistributors[0] ||
        (superfluidQueryRes?.account &&
          superfluidQueryRes.account.outflows.length > 0) ? (
          <Card className="bg-light mt-3 mx-3 p-2 rounded-4 border-0">
            <Card.Header className="bg-light border-bottom border-gray mx-2 p-0 text-info fs-5">
              Your Streams ({allocationTokenInfo?.name}/mo)
            </Card.Header>
            <Card.Body className="p-2">
              {superfluidQueryRes?.poolDistributors[0] ? (
                <Stack
                  direction="horizontal"
                  gap={2}
                  className="align-items-center"
                >
                  <Card.Text className="w-66 m-0 text-info">
                    Matching Pool
                  </Card.Text>
                  <Card.Text className="w-25 m-0">
                    {Intl.NumberFormat("en", {
                      maximumFractionDigits: 6,
                    }).format(
                      Number(
                        formatEther(
                          BigInt(
                            superfluidQueryRes.poolDistributors[0].flowRate,
                          ) * BigInt(SECONDS_IN_MONTH),
                        ),
                      ),
                    )}
                  </Card.Text>
                  <Button
                    variant="transparent"
                    className="px-0 py-2"
                    onClick={() =>
                      setStreamDeletionModalState({
                        show: true,
                        isMatchingPool: true,
                        receiver: gdaPoolAddress!,
                      })
                    }
                  >
                    <Image
                      src="/delete.svg"
                      alt="Delete"
                      width={20}
                      height={20}
                    />
                  </Button>
                  <Button
                    variant="transparent"
                    className="px-0 py-2"
                    onClick={() => {
                      setShowOffcanvas(false);
                      router.push(
                        `/pool/?chainId=${chainId}&poolId=${poolId}&editPoolDistribution=true`,
                      );
                    }}
                  >
                    <Image src="/edit.svg" alt="Edit" width={20} height={20} />
                  </Button>
                </Stack>
              ) : null}
              {superfluidQueryRes?.account ? (
                <>
                  {superfluidQueryRes.account.outflows.map(
                    (
                      outflow: {
                        currentFlowRate: string;
                        receiver: { id: string };
                      },
                      i: number,
                    ) => (
                      <Stack
                        direction="horizontal"
                        gap={3}
                        className="align-items-center border-bottom border-white"
                        key={i}
                      >
                        <Card.Text className="w-66 m-0 text-info text-truncate">
                          {outflow.receiver.id === FLOW_STATE_RECEIVER
                            ? "Flow State"
                            : flowStateQueryRes.pool.recipientsByPoolIdAndChainId.find(
                                (recipient: { superappAddress: string }) =>
                                  recipient.superappAddress ===
                                  outflow.receiver.id,
                              )?.metadata.title}
                        </Card.Text>
                        <Card.Text className="w-25 m-0">
                          {Intl.NumberFormat("en", {
                            maximumFractionDigits: 6,
                          }).format(
                            Number(
                              formatEther(
                                BigInt(outflow.currentFlowRate) *
                                  BigInt(SECONDS_IN_MONTH),
                              ),
                            ),
                          )}
                        </Card.Text>
                        <Button
                          variant="transparent"
                          className="px-0 py-2"
                          onClick={() =>
                            setStreamDeletionModalState({
                              show: true,
                              isMatchingPool: false,
                              receiver: outflow.receiver.id,
                            })
                          }
                        >
                          <Image
                            src="/delete.svg"
                            alt="Delete"
                            width={20}
                            height={20}
                          />
                        </Button>
                        <Button
                          variant="transparent"
                          className="px-0 py-2"
                          onClick={() => {
                            setShowOffcanvas(false);

                            router.push(
                              outflow.receiver.id === FLOW_STATE_RECEIVER
                                ? `/core/?chainId=${chainId}`
                                : `/pool/?chainId=${chainId}&poolId=${poolId}&recipientId=${flowStateQueryRes?.pool.recipientsByPoolIdAndChainId.find((recipient: { superappAddress: string }) => recipient.superappAddress === outflow.receiver.id)?.id}`,
                            );
                          }}
                        >
                          <Image
                            src="/edit.svg"
                            alt="Edit"
                            width={20}
                            height={20}
                          />
                        </Button>
                      </Stack>
                    ),
                  )}
                </>
              ) : null}
            </Card.Body>
          </Card>
        ) : null}
        <Stack
          direction="horizontal"
          gap={1}
          className="bg-light rounded-top-4 mt-3 mx-3 p-3 fs-4"
        >
          <Badge
            className={`cursor-pointer rounded-3 ${
              token === Token.ALLOCATION
                ? "bg-success text-success"
                : "bg-light text-info"
            }`}
            style={{
              background:
                token === Token.ALLOCATION
                  ? "linear-gradient(rgba(0,0,0,.50),rgba(0,0,0,.50))"
                  : "",
            }}
            onClick={() => setToken(Token.ALLOCATION)}
          >
            {allocationTokenInfo?.name}
          </Badge>
          {allocationToken !== matchingToken && (
            <Badge
              className={`cursor-pointer rounded-3 ${
                token === Token.MATCHING
                  ? "bg-success text-success"
                  : "bg-light text-info"
              }`}
              style={{
                background:
                  token === Token.MATCHING
                    ? "linear-gradient(rgba(0,0,0,.50),rgba(0,0,0,.50))"
                    : "",
              }}
              onClick={() => setToken(Token.MATCHING)}
            >
              {matchingTokenInfo?.name}
            </Badge>
          )}
        </Stack>
        <Stack
          direction="horizontal"
          className="bg-light mx-3 p-2 pb-3 fs-4 border-bottom border-white"
        >
          <Card.Text className="m-0 text-info px-2 w-50">Token</Card.Text>
          <Stack direction="horizontal" gap={2} className="align-items-center">
            <Card.Text className="m-0 overflow-hidden text-truncate">
              {truncateStr(
                token === Token.ALLOCATION
                  ? allocationTokenInfo.address
                  : matchingTokenInfo.address,
                10,
              )}
            </Card.Text>
            <Stack direction="horizontal">
              <Button
                variant="transparent"
                className="d-flex align-items-center px-0"
                onClick={() =>
                  navigator.clipboard.writeText(
                    token === Token.ALLOCATION
                      ? allocationTokenInfo.address
                      : (matchingTokenInfo.address ?? "0x"),
                  )
                }
              >
                <Image
                  src="/copy.svg"
                  alt="Copy"
                  width={20}
                  style={{
                    filter:
                      "brightness(0) saturate(100%) invert(0%) sepia(100%) saturate(7460%) hue-rotate(59deg) brightness(105%) contrast(111%)",
                  }}
                />
              </Button>
              <Button
                variant="link"
                target="_blank"
                href={`${network?.blockExplorer}/address/${token === Token.ALLOCATION ? allocationTokenInfo.address : matchingTokenInfo.address}`}
                className="d-flex align-items-center px-0"
              >
                <Image src="/open-new.svg" alt="Link" width={20} />
              </Button>
            </Stack>
          </Stack>
        </Stack>
        <Stack
          direction="horizontal"
          className="bg-light mx-3 p-2 pb-3 fs-4 border-bottom border-white"
        >
          <Card.Text className="m-0 text-info px-2 w-50">Balance</Card.Text>
          <Stack direction="horizontal" gap={2} className="align-items-center">
            <Image
              src={
                token === Token.MATCHING
                  ? matchingTokenInfo.icon
                  : allocationTokenInfo.icon
              }
              alt="token logo"
              width={24}
            />
            <Card.Text className="m-0 overflow-hidden text-truncate">
              {formatNumberWithCommas(
                parseFloat(
                  formatEther(
                    token === Token.ALLOCATION
                      ? superTokenBalanceAllocation
                      : superTokenBalanceMatching,
                  ).slice(0, 8),
                ),
              )}
            </Card.Text>
          </Stack>
        </Stack>
        <Stack
          direction="horizontal"
          className="bg-light mx-3 px-2 py-3 fs-4 border-bottom border-white"
        >
          <Card.Text className="m-0 text-info px-2 w-50">Net Stream</Card.Text>
          <Stack
            direction="horizontal"
            gap={2}
            className="align-items-center w-50"
          >
            <Image
              src={
                token === Token.MATCHING
                  ? matchingTokenInfo.icon
                  : allocationTokenInfo.icon
              }
              alt="close"
              width={24}
            />
            <Card.Text className="m-0 w33 overflow-hidden text-truncate">
              {formatNumberWithCommas(
                parseFloat(
                  roundWeiAmount(
                    BigInt(
                      token === Token.MATCHING
                        ? (accountTokenSnapshotMatching?.totalOutflowRate ?? 0)
                        : (accountTokenSnapshotAllocation?.totalOutflowRate ??
                            0),
                    ) * BigInt(SECONDS_IN_MONTH),
                    6,
                  ),
                ),
              )}
            </Card.Text>
            <Card.Text className="m-0 text-info fs-6">monthly</Card.Text>
          </Stack>
        </Stack>
        <Stack
          direction="horizontal"
          className="bg-light mx-3 rounded-bottom-4 px-2 py-3 fs-4 border-bottom border-white"
        >
          <Card.Text className="m-0 text-info px-2 w-50">Liquidation</Card.Text>
          <Card.Text className="m-0 text-info overflow-hidden text-truncate fs-4">
            {token === Token.MATCHING &&
            accountTokenSnapshotMatching?.maybeCriticalAtTimestamp
              ? dayjs
                  .unix(accountTokenSnapshotMatching.maybeCriticalAtTimestamp)
                  .format("MMM D, YYYY")
              : token === Token.ALLOCATION &&
                  accountTokenSnapshotAllocation?.maybeCriticalAtTimestamp
                ? dayjs
                    .unix(
                      accountTokenSnapshotAllocation?.maybeCriticalAtTimestamp,
                    )
                    .format("MMM D, YYYY")
                : "N/A"}
          </Card.Text>
        </Stack>
        <Card.Link
          href="https://app.superfluid.finance"
          target="_blank"
          className="mt-1 mx-3 px-3 text-primary text-center cursor-pointer"
        >
          Visit the Superfluid App for advanced management of your Super Token
          balances
        </Card.Link>
        {eligibilityMethod === EligibilityMethod.NFT_GATING ? (
          <Card className="bg-light m-3 p-2 rounded-4 border-0">
            <Card.Header className="bg-light border-bottom border-gray mx-2 p-0 py-1 text-info fs-5">
              Matching Eligibility
            </Card.Header>
            <Card.Body className="p-2">
              <Stack
                direction="horizontal"
                gap={3}
                className="justify-content-center mb-4"
              >
                <Stack
                  direction="vertical"
                  gap={2}
                  className="align-items-center"
                >
                  <Image
                    src={
                      nftBalance && nftBalance > 0
                        ? "/success.svg"
                        : "close.svg"
                    }
                    alt={nftBalance && nftBalance > 0 ? "success" : "fail"}
                    width={48}
                    height={48}
                    style={{
                      filter:
                        nftBalance && nftBalance > 0
                          ? "invert(40%) sepia(14%) saturate(2723%) hue-rotate(103deg) brightness(97%) contrast(80%)"
                          : "invert(27%) sepia(47%) saturate(3471%) hue-rotate(336deg) brightness(93%) contrast(85%)",
                    }}
                  />
                  <Card.Text
                    className={`m-0 ${nftBalance && nftBalance > 0 ? "text-success" : "text-danger"}`}
                  >
                    {nftBalance && nftBalance > 0 ? "Eligibile" : "Ineligible"}
                  </Card.Text>
                </Stack>
                <Stack
                  direction="vertical"
                  className="align-items-center justify-content-center m-auto"
                >
                  NFT Required:
                  <Stack direction="horizontal" gap={2} className="m-auto mt-0">
                    <Card.Text className="m-0">
                      {requiredNftAddress
                        ? truncateStr(requiredNftAddress as string, 12)
                        : ""}
                    </Card.Text>
                    <Button
                      variant="link"
                      href={`${network?.blockExplorer}/address/${requiredNftAddress}`}
                      target="_blank"
                      className="d-flex align-items-center p-0"
                    >
                      <Image
                        src="open-new.svg"
                        alt="open"
                        width={18}
                        height={18}
                      />
                    </Button>
                  </Stack>
                </Stack>
              </Stack>
              <Stack>
                {nftMintUrl?.startsWith("https://guild.xyz/octant-sqf-voter") &&
                (!nftBalance || nftBalance === BigInt(0)) ? (
                  <>
                    <Button
                      className="d-flex justify-content-center align-items-center text-light gap-2"
                      onClick={
                        !isLoadingNftMint ? handleNftMintRequest : void 0
                      }
                    >
                      Claim NFT
                      {isLoadingNftMint && <Spinner size="sm" />}
                    </Button>
                    {errorNftMint && (
                      <p className="mb-1 small text-center text-danger">
                        {errorNftMint}
                      </p>
                    )}
                  </>
                ) : nftMintUrl && (!nftBalance || nftBalance === BigInt(0)) ? (
                  <Button
                    variant="link"
                    href={nftMintUrl}
                    target="_blank"
                    className="bg-primary text-light text-decoration-none"
                  >
                    Claim NFT
                  </Button>
                ) : !nftBalance || nftBalance === BigInt(0) ? (
                  <Card.Text className="m-0">
                    Double check the wallet you're using or reach out to the
                    pool admins if you think you should be eligible.
                  </Card.Text>
                ) : null}
              </Stack>
            </Card.Body>
          </Card>
        ) : (
          <Card className="bg-light m-3 p-2 rounded-4 border-0">
            <Card.Header className="bg-light border-bottom border-gray mx-2 p-0 py-1 text-info fs-5">
              Current Gitcoin Passport Score
            </Card.Header>
            <Card.Body className="p-2">
              {minPassportScore ? (
                <>
                  <Stack
                    direction="horizontal"
                    gap={2}
                    className={`${
                      passportScore && passportScore > minPassportScore
                        ? "text-success"
                        : passportScore
                          ? "text-danger"
                          : "text-warning"
                    }`}
                  >
                    <Image src="/passport.svg" alt="passport" width={36} />
                    <Card.Text className="m-0 fs-1 fw-bold">
                      {passportScore
                        ? parseFloat((Number(passportScore) / 10000).toFixed(3))
                        : "N/A"}
                    </Card.Text>
                    <Card.Text className="m-0 ms-2 fs-6" style={{ width: 100 }}>
                      min. {Number(minPassportScore) / 10000} required for
                      matching
                    </Card.Text>
                    <Button
                      variant="transparent"
                      className="p-0 ms-1"
                      onClick={() =>
                        refetchPassportScore({ throwOnError: false })
                      }
                    >
                      <Image
                        src="/reload.svg"
                        alt="Reload"
                        width={28}
                        style={{
                          filter:
                            passportScore && passportScore > minPassportScore
                              ? "invert(40%) sepia(14%) saturate(2723%) hue-rotate(103deg) brightness(97%) contrast(80%)"
                              : passportScore
                                ? "invert(27%) sepia(47%) saturate(3471%) hue-rotate(336deg) brightness(93%) contrast(85%)"
                                : "invert(86%) sepia(44%) saturate(4756%) hue-rotate(353deg) brightness(109%) contrast(103%)",
                        }}
                      />
                    </Button>
                  </Stack>
                  <Button
                    className="w-100 mt-2 rounded-3 rounded-3 text-light"
                    onClick={() => setShowMintingInstructions(true)}
                  >
                    Update stamps and mint
                  </Button>
                </>
              ) : (
                <Stack
                  direction="vertical"
                  gap={2}
                  className="align-items-center"
                >
                  <Spinner
                    animation="border"
                    role="status"
                    className="mx-auto mt-5 p-3"
                  ></Spinner>
                  <Card.Text className="text-center">
                    Waiting for passport details...
                  </Card.Text>
                </Stack>
              )}
            </Card.Body>
          </Card>
        )}
      </Offcanvas>
      {network && (
        <PassportMintingInstructions
          show={showMintingInstructions}
          hide={() => setShowMintingInstructions(false)}
          network={network}
          minPassportScore={
            minPassportScore ? Number(minPassportScore) / 10000 : 0
          }
        />
      )}
      {streamDeletionModalState.show && (
        <StreamDeletionModal
          show={streamDeletionModalState.show}
          network={network}
          allocationToken={allocationTokenInfo.address}
          matchingToken={matchingTokenInfo.address}
          receiver={streamDeletionModalState.receiver}
          isMatchingPool={streamDeletionModalState.isMatchingPool}
          hide={() =>
            setStreamDeletionModalState({
              isMatchingPool: false,
              receiver: "",
              show: false,
            })
          }
        />
      )}
    </>
  );
}
