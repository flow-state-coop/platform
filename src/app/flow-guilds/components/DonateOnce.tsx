import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Address,
  parseEther,
  parseUnits,
  formatEther,
  encodeFunctionData,
  erc20Abi,
} from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { useQuery, gql } from "@apollo/client";
import { superTokenAbi } from "@sfpro/sdk/abi";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Dropdown from "react-bootstrap/Dropdown";
import Alert from "react-bootstrap/Alert";
import Image from "react-bootstrap/Image";
import Toast from "react-bootstrap/Toast";
import InputGroup from "react-bootstrap/InputGroup";
import Spinner from "react-bootstrap/Spinner";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { TransactionCall } from "@/types/transactionCall";
import CopyTooltip from "@/components/CopyTooltip";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowingAmount from "@/hooks/flowingAmount";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import useSuperTokenType from "@/hooks/superTokenType";
import useSuperTokenBalanceOfNow from "@/hooks/superTokenBalanceOfNow";
import { networks } from "@/lib/networks";
import { getApolloClient } from "@/lib/apollo";
import { truncateStr, formatNumber, isNumber } from "@/lib/utils";
import { FlowGuildConfig } from "../lib/flowGuildConfig";

dayjs.extend(duration);

type DonateOnceProps = {
  flowGuildConfig: FlowGuildConfig;
  network: Network;
  token: Token;
  selectToken: (token: Token) => void;
  showOpenFlow: () => void;
  handleClose: () => void;
};

const ACCOUNT_TOKEN_SNAPSHOT_QUERY = gql`
  query AccountTokenSnapshot($address: String, $token: String) {
    account(id: $address) {
      accountTokenSnapshots(where: { token: $token }) {
        totalNetFlowRate
        maybeCriticalAtTimestamp
        token {
          id
        }
      }
    }
  }
`;

export default function DonateOnce(props: DonateOnceProps) {
  const { flowGuildConfig, network, token, selectToken, handleClose } = props;

  const [amount, setAmount] = useState("");
  const [wrapAmount, setWrapAmount] = useState("");
  const [amountWei, setAmountWei] = useState(BigInt(0));
  const [success, setSuccess] = useState(false);

  const { isMobile, isTablet } = useMediaQuery();
  const { address } = useAccount();
  const router = useRouter();
  const {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    isBatchSupported,
    executeTransactions,
  } = useTransactionsQueue();
  const { data: superfluidQueryRes } = useQuery(ACCOUNT_TOKEN_SNAPSHOT_QUERY, {
    client: getApolloClient("superfluid", network.id),
    variables: {
      address: address?.toLowerCase() ?? "",
      token: token?.address.toLowerCase() ?? "",
    },
    pollInterval: 10000,
    skip: !address || !token,
  });
  const accountTokenSnapshot =
    superfluidQueryRes?.account?.accountTokenSnapshots[0] ?? null;
  const { balanceUntilUpdatedAt, updatedAtTimestamp } =
    useSuperTokenBalanceOfNow({
      token: token?.address,
      address,
      chainId: network.id,
    });
  const superTokenBalance = useFlowingAmount(
    BigInt(balanceUntilUpdatedAt ?? 0),
    updatedAtTimestamp ?? 0,
    BigInt(accountTokenSnapshot?.totalNetFlowRate ?? 0),
  );
  const {
    isSuperTokenNative,
    isSuperTokenWrapper,
    isSuperTokenPure,
    underlyingAddress: tokenUnderlyingAddress,
  } = useSuperTokenType(token.address, network.id);
  const { data: ethBalance } = useBalance({
    address,
    chainId: network?.id,
    query: {
      refetchInterval: 10000,
    },
  });
  const { data: underlyingTokenBalance } = useBalance({
    address,
    token: tokenUnderlyingAddress as Address,
    chainId: network.id,
    query: {
      refetchInterval: 10000,
      enabled: isSuperTokenWrapper === true,
    },
  });
  const { data: underlyingTokenAllowance } = useReadContract({
    address: tokenUnderlyingAddress as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address!, token.address],
    chainId: network.id,
    query: {
      enabled: isSuperTokenWrapper === true && !!address,
      refetchInterval: 10000,
    },
  });

  const hasSufficientSuperTokenBalance =
    superTokenBalance > BigInt(amountWei) ? true : false;
  const hasSufficientWrappingBalance =
    (isSuperTokenNative &&
      ethBalance &&
      ethBalance?.value >= parseEther(wrapAmount)) ||
    (underlyingTokenBalance &&
      underlyingTokenBalance?.value >=
        parseUnits(wrapAmount, underlyingTokenBalance.decimals))
      ? true
      : false;

  const canSubmit =
    amountWei > 0 &&
    (hasSufficientSuperTokenBalance || hasSufficientWrappingBalance);

  const calls = useMemo(() => {
    if (!address || !amountWei || isSuperTokenWrapper === undefined) return [];

    const wrapAmountWei = parseEther(wrapAmount);
    const wrapAmountUnits = parseUnits(
      wrapAmount,
      underlyingTokenBalance?.decimals ?? 18,
    );
    const needsApproval =
      isSuperTokenWrapper &&
      wrapAmountUnits > BigInt(underlyingTokenAllowance ?? 0);
    const newCalls: TransactionCall[] = [];

    if (!isSuperTokenPure && wrapAmountWei > 0) {
      if (isSuperTokenWrapper && tokenUnderlyingAddress && needsApproval) {
        newCalls.push({
          to: tokenUnderlyingAddress as Address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [token.address, wrapAmountUnits],
          }),
        });
      }

      if (isSuperTokenWrapper) {
        newCalls.push({
          to: token.address,
          data: encodeFunctionData({
            abi: superTokenAbi,
            functionName: "upgrade",
            args: [wrapAmountWei],
          }),
        });
      } else if (isSuperTokenNative) {
        newCalls.push({
          to: token.address,
          data: encodeFunctionData({
            abi: superTokenAbi,
            functionName: "upgradeByETH",
            args: [],
          }),
          value: wrapAmountWei,
        });
      }
    }

    newCalls.push({
      to: token.address,
      data: encodeFunctionData({
        abi: superTokenAbi,
        functionName: "transfer",
        args: [flowGuildConfig.safe as Address, amountWei],
      }),
    });

    return newCalls;
  }, [
    address,
    wrapAmount,
    amountWei,
    flowGuildConfig,
    underlyingTokenBalance,
    underlyingTokenAllowance,
    isSuperTokenPure,
    isSuperTokenWrapper,
    isSuperTokenNative,
    tokenUnderlyingAddress,
    token.address,
  ]);

  const handleAmountSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;

    if (isNumber(value)) {
      const amountWei = parseEther(value);
      const netFlowRate = BigInt(accountTokenSnapshot?.totalNetFlowRate ?? 0);

      setAmount(value);
      setAmountWei(amountWei);

      let hourBuffer = BigInt(0);

      if (netFlowRate < 0) {
        hourBuffer = -netFlowRate * BigInt(3600);
      }

      if (!isSuperTokenPure && amountWei > superTokenBalance) {
        setWrapAmount(formatEther(amountWei - superTokenBalance + hourBuffer));
      } else {
        setWrapAmount("");
      }
    } else if (value === "") {
      setAmount("");
      setWrapAmount("");
      setAmountWei(BigInt(0));
    } else if (value === ".") {
      setAmount("0.");
      setWrapAmount("");
      setAmountWei(BigInt(0));
    }
  };

  const handleSubmit = async () => {
    try {
      await executeTransactions(calls);

      setSuccess(true);
      setWrapAmount("");
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Stack direction="vertical" className="bg-lace-100 rounded-4 p-4">
      <Stack direction="horizontal" className="justify-content-between">
        <Card.Text className="fs-5 fw-semi-bold mb-0">Donate Once</Card.Text>
        {!isMobile && !isTablet && (
          <Button
            variant="transparent"
            onClick={handleClose}
            className="p-0 float-end"
          >
            <Image src="/close.svg" alt="" width={24} height={24} />
          </Button>
        )}
      </Stack>
      <Stack direction="vertical" gap={2} className="my-4">
        <Card.Text className="mt-2 mb-0 fs6">
          {" "}
          Recipient (Multi-Chain Safe)
        </Card.Text>
        <InputGroup className="align-items-center gap-2">
          <Form.Control
            disabled
            value={truncateStr(flowGuildConfig.safe, 20)}
            className="w-50 rounded-2 bg-white border-0 fw-semi-bold overflow-hidden"
          />
          <CopyTooltip
            contentClick="Address copied"
            contentHover="Copy address"
            handleCopy={() =>
              navigator.clipboard.writeText(flowGuildConfig.safe)
            }
            target={
              <Image src="/copy-dark.svg" alt="Copy" width={24} height={24} />
            }
          />
          <Button
            variant="link"
            href={`${network.blockExplorer}/address/${flowGuildConfig.safe}`}
            target="_blank"
            className="p-0"
          >
            <Image src="/open-new.svg" alt="Open" width={24} height={24} />
          </Button>
        </InputGroup>
        <Dropdown className="my-2">
          <Dropdown.Toggle className="d-flex justify-content-between align-items-center w-100 bg-white border-0 py-2 text-dark fw-semi-bold">
            {network.name}
          </Dropdown.Toggle>
          <Dropdown.Menu>
            {networks.map((network, i) => (
              <Dropdown.Item
                key={i}
                onClick={() => {
                  router.push(`/core/?chainId=${network.id}`);
                }}
              >
                {network.name}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
      </Stack>
      <Stack direction="horizontal" gap={2} className="align-items-start">
        <Stack direction="vertical" className="w-50">
          <InputGroup className="w-75">
            <Form.Control
              type="text"
              placeholder="0"
              className="border-0 fw-semi-bold"
              value={amount}
              onChange={handleAmountSelection}
            />
            <Dropdown>
              <Dropdown.Toggle className="d-flex justify-content-between align-items-center border-0 bg-white fw-semi-bold text-dark">
                {token.symbol}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {network.tokens.map((token, i) => (
                  <Dropdown.Item
                    key={i}
                    onClick={() => {
                      selectToken(token);
                    }}
                  >
                    {token.symbol}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          </InputGroup>
          {!isSuperTokenPure && (
            <Card.Text
              className={`mt-2 mb-0 ms-2 ${!hasSufficientWrappingBalance ? "text-danger" : "text-info"}`}
              style={{
                fontSize: "0.8rem",
              }}
            >
              {isSuperTokenNative
                ? ethBalance?.symbol
                : underlyingTokenBalance?.symbol}
              :{" "}
              {formatNumber(
                Number(
                  isSuperTokenNative
                    ? ethBalance?.formatted
                    : underlyingTokenBalance?.formatted,
                ),
              )}{" "}
            </Card.Text>
          )}
          <Card.Text
            className={`mb-0 ms-2 ${!hasSufficientSuperTokenBalance ? "text-danger" : "text-info"}`}
            style={{
              fontSize: "0.8rem",
            }}
          >
            {token.symbol}:{" "}
            {formatNumber(Number(formatEther(superTokenBalance)))}
            {!hasSufficientSuperTokenBalance && (
              <>
                {" "}
                (need +
                {formatNumber(
                  Number(formatEther(amountWei - superTokenBalance)),
                )}
                )
              </>
            )}
          </Card.Text>
        </Stack>
      </Stack>
      <Button
        disabled={!canSubmit}
        className="w-100 mt-4 py-4 fs-lg fw-semi-bold rounded-4"
        onClick={handleSubmit}
      >
        {areTransactionsLoading ? (
          <>
            <Spinner size="sm" />{" "}
            {calls.length > 1 && !isBatchSupported && (
              <>
                ({completedTransactions + 1}/{calls.length})
              </>
            )}
          </>
        ) : canSubmit && calls.length > 1 && !isBatchSupported ? (
          <>Submit ({calls.length})</>
        ) : (
          <>Submit</>
        )}
      </Button>
      {canSubmit && calls.length > 1 && !isBatchSupported && (
        <Stack
          direction="horizontal"
          gap={2}
          className="justify-content-center my-2"
        >
          <Card.Text className="m-0 small">
            1) Wrap {formatNumber(Number(wrapAmount))}{" "}
            {isSuperTokenNative
              ? ethBalance?.symbol
              : underlyingTokenBalance?.symbol}{" "}
            to {token.symbol}
          </Card.Text>
          <Card.Text className="m-0 small">
            2) Distribute {amount} {token.symbol}
          </Card.Text>
        </Stack>
      )}
      <Toast
        show={success}
        delay={4000}
        autohide={true}
        onClose={() => setSuccess(false)}
        className="w-100 bg-success mt-3 p-3 fs-6 text-white fw-semi-bold"
      >
        Success!
      </Toast>
      {!!transactionError && (
        <Alert variant="danger" className="w-100 mt-3 p-3 fs-5">
          {transactionError}
        </Alert>
      )}
    </Stack>
  );
}
