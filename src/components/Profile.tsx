import { useState, useMemo } from "react";
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
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Image from "react-bootstrap/Image";
import Badge from "react-bootstrap/Badge";
import Spinner from "react-bootstrap/Spinner";
import PassportMintingInstructions from "./PassportMintingInstructions";
import useDonorParams from "@/hooks/donorParams";
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
import { ZERO_ADDRESS, SECONDS_IN_MONTH } from "@/lib/constants";

enum Token {
  ALLOCATION,
  MATCHING,
}

enum EligibilityMethod {
  PASSPORT,
  NFT_GATING,
}

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(advancedFormat);

const ACCOUNT_QUERY = gql`
  query AccountQuery($userAddress: String!) {
    account(id: $userAddress) {
      accountTokenSnapshots {
        balanceUntilUpdatedAt
        totalNetFlowRate
        totalOutflowRate
        updatedAtTimestamp
        maybeCriticalAtTimestamp
        token {
          id
        }
      }
    }
  }
`;

export default function Profile() {
  const [showProfile, setShowProfile] = useState(false);
  const [showMintingInstructions, setShowMintingInstructions] = useState(false);
  const [token, setToken] = useState(Token.ALLOCATION);

  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const {
    strategyAddress,
    chainId,
    allocationToken,
    matchingToken,
    nftMintUrl,
  } = useDonorParams();
  const { data: superfluidQueryRes } = useQuery(ACCOUNT_QUERY, {
    client: getApolloClient("superfluid", chainId ?? void 0),
    variables: {
      userAddress: address?.toLowerCase() ?? "0x",
    },
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

  const network = networks.find((network) => network.id === chainId);
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
  const superTokenBalanceAllocation = useFlowingAmount(
    BigInt(accountTokenSnapshotAllocation?.balanceUntilUpdatedAt ?? 0),
    accountTokenSnapshotAllocation?.updatedAtTimestamp ?? 0,
    BigInt(accountTokenSnapshotAllocation?.totalNetFlowRate ?? 0),
  );
  const superTokenBalanceMatching = useFlowingAmount(
    BigInt(accountTokenSnapshotMatching?.balanceUntilUpdatedAt ?? 0),
    accountTokenSnapshotMatching?.updatedAtTimestamp ?? 0,
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

  const handleCloseProfile = () => setShowProfile(false);
  const handleShowProfile = () => setShowProfile(true);

  return (
    <>
      <ButtonGroup className="d-flex align-items-center">
        <Button
          variant="transparent"
          disabled={showProfile}
          onClick={handleShowProfile}
          className="d-none d-xl-block bg-transparent border border-black rounded-start"
        >
          {!superfluidQueryRes ? (
            <Spinner size="sm" animation="border" role="status"></Spinner>
          ) : (
            <Card.Text className="m-0">
              {formatEther(superTokenBalanceAllocation).slice(0, 8)}{" "}
              {allocationTokenInfo?.name}
            </Card.Text>
          )}
        </Button>
        <Button
          variant="link"
          disabled={showProfile}
          onClick={handleShowProfile}
          className="d-none d-xl-flex align-items-center gap-1 border border-black rounded-end"
        >
          <Card.Text className="m-0">
            {truncateStr(address ?? "0x", 14)}{" "}
          </Card.Text>
        </Button>
      </ButtonGroup>
      <Button
        variant="transparent"
        disabled={showProfile}
        onClick={handleShowProfile}
        className="d-xl-none"
      >
        <Image width={32} height={32} src="/account-circle.svg" alt="Account" />
      </Button>
      <Offcanvas
        show={showProfile}
        scroll
        onHide={handleCloseProfile}
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
            onClick={handleCloseProfile}
          >
            <Image src="/close.svg" alt="close" width={28} />
          </Button>
        </Stack>
        <Stack
          direction="horizontal"
          className="justify-content-between align-items-center p-3"
        >
          <Stack direction="horizontal" className="align-items-center">
            <Card.Text className="m-0">
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
              handleCloseProfile();
            }}
          >
            <Card.Text className="m-0">Disconnect</Card.Text>
            <Image src="/logout.svg" alt="Logout" width={18} />{" "}
          </Button>
        </Stack>
        {eligibilityMethod === EligibilityMethod.NFT_GATING ? (
          <Card className="bg-light mx-3 p-2 rounded-4 border-0">
            <Card.Header className="bg-light border-bottom border-gray mx-2 p-0 py-1 text-info fs-5">
              NFT Gating
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
                          ? "invert(65%) sepia(44%) saturate(6263%) hue-rotate(103deg) brightness(95%) contrast(97%)"
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
                {nftMintUrl ? (
                  <Button
                    variant="link"
                    href={nftMintUrl}
                    target="_blank"
                    disabled={!!nftBalance && nftBalance > 0 ? true : false}
                    className="bg-info text-light"
                  >
                    Get the NFT
                  </Button>
                ) : (
                  <Card.Text className="m-0">
                    Double check the wallet you're using or reach out to the
                    pool admins if you think you should be eligible.
                  </Card.Text>
                )}
              </Stack>
            </Card.Body>
          </Card>
        ) : (
          <Card className="bg-light mx-3 p-2 rounded-4 border-0">
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
                              ? "invert(65%) sepia(44%) saturate(6263%) hue-rotate(103deg) brightness(95%) contrast(97%)"
                              : passportScore
                                ? "invert(27%) sepia(47%) saturate(3471%) hue-rotate(336deg) brightness(93%) contrast(85%)"
                                : "invert(88%) sepia(26%) saturate(4705%) hue-rotate(2deg) brightness(109%) contrast(102%)",
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
                      : matchingTokenInfo.address ?? "0x",
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
                        ? accountTokenSnapshotMatching?.totalOutflowRate ?? 0
                        : accountTokenSnapshotAllocation?.totalOutflowRate ?? 0,
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
          className="mx-3 p-3 text-primary text-center text-decoration-underline cursor-pointer"
        >
          Visit the Superfluid App for advanced management of your Super Token
          balances
        </Card.Link>
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
    </>
  );
}
