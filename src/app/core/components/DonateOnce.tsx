import { useState, useEffect } from "react";
import Link from "next/link";
import { Address, parseAbi, parseEther, parseUnits, formatEther } from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { useQuery, gql } from "@apollo/client";
import {
  SuperToken,
  NativeAssetSuperToken,
  WrapperSuperToken,
  Framework,
} from "@superfluid-finance/sdk-core";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Image from "react-bootstrap/Image";
import Toast from "react-bootstrap/Toast";
import InputGroup from "react-bootstrap/InputGroup";
import Spinner from "react-bootstrap/Spinner";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { GDAPool } from "@/types/gdaPool";
import InfoTooltip from "@/components/InfoTooltip";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowingAmount from "@/hooks/flowingAmount";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import { useEthersProvider, useEthersSigner } from "@/hooks/ethersAdapters";
import { getApolloClient } from "@/lib/apollo";
import { formatNumber, isNumber } from "@/lib/utils";
import { ZERO_ADDRESS } from "@/lib/constants";

dayjs().format();
dayjs.extend(duration);

type DonateOnceProps = {
  network: Network;
  token: Token;
  pool?: GDAPool;
  handleClose?: () => void;
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
    token(id: $token) {
      isNativeAssetSuperToken
      underlyingAddress
    }
  }
`;

export default function DonateOnce(props: DonateOnceProps) {
  const { network, token, pool, handleClose } = props;

  const [amount, setAmount] = useState("");
  const [wrapAmount, setWrapAmount] = useState("");
  const [amountWei, setAmountWei] = useState(BigInt(0));
  const [success, setSuccess] = useState(false);
  const [sfFramework, setSfFramework] = useState<Framework>();
  const [distributionSuperToken, setDistributionSuperToken] = useState<
    NativeAssetSuperToken | WrapperSuperToken | SuperToken
  >();
  const [underlyingTokenAllowance, setUnderlyingTokenAllowance] = useState("");
  const [transactions, setTransactions] = useState<(() => Promise<void>)[]>([]);

  const { isMobile } = useMediaQuery();
  const { address } = useAccount();
  const ethersProvider = useEthersProvider({ chainId: network.id });
  const ethersSigner = useEthersSigner({ chainId: network.id });
  const {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
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
  const { data: realtimeBalanceOfNow } = useReadContract({
    address: token?.address,
    functionName: "realtimeBalanceOfNow",
    abi: parseAbi([
      "function realtimeBalanceOfNow(address) returns (int256,uint256,uint256,uint256)",
    ]),
    args: [address],
    chainId: network.id,
    query: { refetchInterval: 10000 },
  });

  const balanceUntilUpdatedAt = realtimeBalanceOfNow?.[0];
  const updatedAtTimestamp = realtimeBalanceOfNow
    ? Number(realtimeBalanceOfNow[3])
    : null;
  const superTokenBalance = useFlowingAmount(
    BigInt(balanceUntilUpdatedAt ?? 0),
    updatedAtTimestamp ?? 0,
    BigInt(accountTokenSnapshot?.totalNetFlowRate ?? 0),
  );
  const isSuperTokenNative = superfluidQueryRes?.token?.isNativeAssetSuperToken;
  const isSuperTokenPure =
    !isSuperTokenNative &&
    superfluidQueryRes?.token?.underlyingAddress === ZERO_ADDRESS;
  const isSuperTokenWrapper = !isSuperTokenNative && !isSuperTokenPure;
  const { data: ethBalance } = useBalance({
    address,
    chainId: network?.id,
    query: {
      refetchInterval: 10000,
    },
  });
  const { data: underlyingTokenBalance } = useBalance({
    address,
    token: superfluidQueryRes?.token?.underlyingAddress as Address,
    chainId: network.id,
    query: {
      refetchInterval: 10000,
      enabled: isSuperTokenWrapper,
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

  useEffect(() => {
    (async () => {
      if (!token || !ethersProvider || !address) {
        return;
      }

      const sfFramework = await Framework.create({
        chainId: network.id,
        resolverAddress: network.superfluidResolver,
        provider: ethersProvider,
      });
      const distributionSuperToken = await sfFramework.loadSuperToken(
        isSuperTokenNative ? "ETHx" : token.address,
      );
      const underlyingToken = distributionSuperToken.underlyingToken;
      const underlyingTokenAllowance = await underlyingToken?.allowance({
        owner: address,
        spender: distributionSuperToken.address,
        providerOrSigner: ethersProvider,
      });

      setUnderlyingTokenAllowance(underlyingTokenAllowance ?? "0");
      setSfFramework(sfFramework);
      setDistributionSuperToken(distributionSuperToken);
    })();
  }, [address, network, ethersProvider, token, isSuperTokenNative]);

  useEffect(() => {
    (async () => {
      if (
        !address ||
        !pool ||
        !underlyingTokenAllowance ||
        !distributionSuperToken ||
        !sfFramework ||
        !ethersProvider ||
        !ethersSigner
      ) {
        return [];
      }

      const wrapAmountWei = parseEther(wrapAmount);
      const underlyingToken = distributionSuperToken.underlyingToken;
      const approvalTransactionsCount =
        isSuperTokenWrapper &&
        wrapAmountWei > BigInt(underlyingTokenAllowance ?? 0)
          ? 1
          : 0;
      const transactions: (() => Promise<void>)[] = [];

      if (!isSuperTokenPure && wrapAmountWei > 0) {
        if (underlyingToken && approvalTransactionsCount > 0) {
          transactions.push(async () => {
            const tx = await underlyingToken
              .approve({
                receiver: distributionSuperToken.address,
                amount: parseUnits(
                  wrapAmount,
                  underlyingTokenBalance?.decimals ?? 18,
                ).toString(),
              })
              .exec(ethersSigner);

            await tx.wait();
          });
        }

        if (isSuperTokenWrapper) {
          transactions.push(async () => {
            const tx = await (distributionSuperToken as WrapperSuperToken)
              .upgrade({
                amount: wrapAmountWei.toString(),
              })
              .exec(ethersSigner);

            await tx.wait();
          });
        } else {
          transactions.push(async () => {
            const tx = await (distributionSuperToken as NativeAssetSuperToken)
              .upgrade({
                amount: wrapAmountWei.toString(),
              })
              .exec(ethersSigner);

            await tx.wait();
          });
        }
      }

      transactions.push(async () => {
        const tx = await distributionSuperToken
          .transfer({
            receiver: address,
            amount: amountWei.toString(),
          })
          .exec(ethersSigner);

        await tx.wait();
      });

      setTransactions(transactions);
    })();
  }, [
    address,
    wrapAmount,
    pool,
    amountWei,
    underlyingTokenBalance,
    underlyingTokenAllowance,
    sfFramework,
    ethersProvider,
    ethersSigner,
    distributionSuperToken,
    isSuperTokenPure,
    isSuperTokenWrapper,
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
      await executeTransactions(transactions);

      setSuccess(true);
      setWrapAmount("");
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Stack direction="vertical">
      <Stack direction="horizontal" className="justify-content-between">
        <Card.Text className="fs-3 mb-0">Donate Once</Card.Text>
        {!isMobile && (
          <Button variant="transparent" onClick={handleClose}>
            <Image src="/close.svg" alt="" width={24} height={24} />
          </Button>
        )}
      </Stack>
      <Stack
        direction="horizontal"
        gap={2}
        className="align-items-start bg-light p-3 rounded-4"
      >
        <Stack direction="vertical" className="w-50">
          <InputGroup className="w-75">
            <Form.Control
              type="text"
              placeholder="0"
              className="rounded-3"
              value={amount}
              onChange={handleAmountSelection}
            />
            <InputGroup.Text className="bg-transparent border-0 fw-bold pe-1">
              {isSuperTokenPure
                ? token.symbol
                : isSuperTokenNative
                  ? ethBalance?.symbol
                  : underlyingTokenBalance?.symbol}
            </InputGroup.Text>
            {!isSuperTokenPure && (
              <InfoTooltip
                position={{ bottom: true }}
                content={
                  <>
                    Like Flow Splitter streams, one-time distribtions are sent
                    with Super Tokens (often a wrapped version of an ERC20 or
                    native token).{" "}
                    <Link
                      href="https://docs.superfluid.finance/docs/concepts/overview/super-tokens"
                      target="_blank"
                      className="text-white"
                    >
                      Learn more
                    </Link>
                    .
                    <br />
                    <br />
                    Just enter how much you want to send, and we'll use your
                    underlying & Super Token balances to queue a wrap
                    transaction as needed.
                  </>
                }
                target={<Image src="/info.svg" alt="" width={14} height={14} />}
              />
            )}
          </InputGroup>
          {!isSuperTokenPure && (
            <Card.Text
              className={`mt-1 mb-0 ms-2 ${!hasSufficientWrappingBalance ? "text-danger" : "text-info"}`}
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
        className="w-100 mt-4"
        onClick={handleSubmit}
      >
        {areTransactionsLoading ? (
          <>
            <Spinner size="sm" />{" "}
            {transactions.length > 1 && (
              <>
                ({completedTransactions + 1}/{transactions.length})
              </>
            )}
          </>
        ) : canSubmit && transactions.length > 1 ? (
          <>Submit ({transactions.length})</>
        ) : (
          <>Submit</>
        )}
      </Button>
      {canSubmit && transactions.length > 1 && (
        <Stack
          direction="horizontal"
          gap={2}
          className="justify-content-center mt-1 mb-2"
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
        className="w-100 bg-success mt-3 p-3 fs-5 text-light"
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
