"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Address,
  erc20Abi,
  formatUnits,
  parseEther,
  parseUnits,
} from "viem";
import {
  useAccount,
  useBalance,
  useConfig,
  usePublicClient,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { writeContract } from "@wagmi/core";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Toast from "react-bootstrap/Toast";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import { hostAddress } from "@sfpro/sdk/abi/core";
import Sidebar from "@/app/flow-councils/components/Sidebar";
import { getApolloClient } from "@/lib/apollo";
import { networks } from "@/lib/networks";
import { superAppSplitterAbi } from "@/lib/abi/superAppSplitter";
import {
  buildBatchCall,
  buildCreateFlowBatchOp,
  buildSuperTokenTransferBatchOp,
  buildWrapCalls,
} from "@/lib/superfluidTransactions";
import { TransactionCall } from "@/types/transactionCall";
import { SECONDS_IN_MONTH } from "@/lib/constants";
import { truncateStr, waitForReceipt } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useSuperTokenBalanceOfNow from "@/hooks/superTokenBalanceOfNow";
import useSuperTokenType from "@/hooks/superTokenType";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import useCouncilMetadata from "@/app/flow-councils/hooks/councilMetadata";
import useSplitterReads from "@/app/flow-councils/hooks/useSplitterReads";
import useActiveSplitterSenders from "@/app/flow-councils/hooks/useActiveSplitterSenders";
import { DEFAULT_ADMIN_ROLE } from "../lib/constants";

type FundingProps = { chainId?: number; councilId?: string };

const FLOW_COUNCIL_QUERY = gql`
  query FundingCouncilQuery($councilId: String!) {
    flowCouncil(id: $councilId) {
      id
      flowCouncilManagers {
        account
        role
      }
    }
  }
`;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function isPositiveDecimal(s: string) {
  return /^\d*(\.\d*)?$/.test(s);
}

function sanitizeTxError(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (
      code === "ACTION_REJECTED" ||
      code === 4001 ||
      (err as { name?: unknown }).name === "UserRejectedRequestError"
    ) {
      return "Transaction rejected";
    }
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string") {
      if (msg.includes("AccessControl")) {
        return "Not authorized: missing role on the splitter contract";
      }
      if (msg.toLowerCase().includes("user rejected")) {
        return "Transaction rejected";
      }
    }
  }
  return "Transaction failed";
}

export default function Funding(props: FundingProps) {
  const { chainId, councilId } = props;

  const router = useRouter();
  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();

  const network = useMemo(
    () => networks.find((n) => n.id === chainId),
    [chainId],
  );
  const factoryDeployed =
    !!network &&
    network.superAppSplitterFactory !== ("0x" as Address) &&
    network.superAppSplitterFactory !== ("0x0000000000000000000000000000000000000000" as Address);

  const councilMetadata = useCouncilMetadata(
    chainId ?? 0,
    councilId ?? "",
  );
  const splitterAddress = (councilMetadata.superappSplitterAddress ??
    null) as Address | null;
  const hasSplitter = !!splitterAddress && factoryDeployed;

  const splitterReads = useSplitterReads({
    splitterAddress,
    hostAddress: network?.superfluidHost ?? null,
    chainId: chainId ?? 0,
    connectedAddress: address,
  });
  const {
    acceptedToken,
    feePortion,
    superTokenBalance: splitterTokenBalance,
    liquidationPeriod,
    impliedMaxMonthlyRate,
    hasStreamAdminRole,
    hasDefaultAdminRole,
  } = splitterReads;

  const tokenInfo = useMemo(() => {
    if (!network || !acceptedToken) return undefined;
    return network.tokens.find(
      (t) => t.address.toLowerCase() === acceptedToken.toLowerCase(),
    );
  }, [network, acceptedToken]);

  const { data: flowCouncilQueryRes } = useQuery(FLOW_COUNCIL_QUERY, {
    client: chainId ? getApolloClient("flowCouncil", chainId) : undefined,
    variables: { councilId: councilId?.toLowerCase() },
    skip: !councilId || !chainId,
    pollInterval: 4000,
  });

  const isSuperAdmin = useMemo(() => {
    if (!flowCouncilQueryRes?.flowCouncil?.flowCouncilManagers || !address) {
      return false;
    }
    return flowCouncilQueryRes.flowCouncil.flowCouncilManagers.some(
      (m: { account: string; role: string }) =>
        m.account === address.toLowerCase() && m.role === DEFAULT_ADMIN_ROLE,
    );
  }, [flowCouncilQueryRes, address]);

  const { balanceUntilUpdatedAt: adminBalanceRaw } = useSuperTokenBalanceOfNow({
    token: acceptedToken ?? undefined,
    address,
    chainId: chainId ?? 0,
  });
  const adminBalance = adminBalanceRaw
    ? BigInt(adminBalanceRaw.toString())
    : 0n;

  const {
    isSuperTokenNative,
    isSuperTokenWrapper,
    isSuperTokenPure,
    underlyingAddress,
  } = useSuperTokenType(acceptedToken ?? "", chainId ?? 0);
  const { data: underlyingBalance } = useBalance({
    address,
    chainId: chainId ?? 0,
    token: isSuperTokenNative ? undefined : underlyingAddress,
    query: {
      enabled: !!address && !!chainId && isSuperTokenWrapper === true,
      refetchInterval: 10000,
    },
  });
  const underlyingValue = underlyingBalance?.value ?? 0n;
  const underlyingDecimals = underlyingBalance?.decimals ?? 18;

  const { data: underlyingAllowance } = useReadContract({
    address: underlyingAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      address && acceptedToken
        ? [address, acceptedToken]
        : undefined,
    chainId: chainId ?? 0,
    query: {
      enabled:
        !!address && !!acceptedToken && isSuperTokenWrapper === true,
      refetchInterval: 10000,
    },
  });

  // Action 1 state
  const [a1MonthlyAmount, setA1MonthlyAmount] = useState("");
  const [a1WrapAmount, setA1WrapAmount] = useState("");

  // Action 2 state
  const [a2DepositAmount, setA2DepositAmount] = useState("");
  const [a2WrapAmount, setA2WrapAmount] = useState("");

  // Action 3 state
  const [a3ConfirmText, setA3ConfirmText] = useState("");
  const [closeAllError, setCloseAllError] = useState("");
  const [closeAllSuccess, setCloseAllSuccess] = useState(false);
  const [isClosingAll, setIsClosingAll] = useState(false);

  const a1NewFlowRate = useMemo(() => {
    if (!a1MonthlyAmount || !isPositiveDecimal(a1MonthlyAmount)) return 0n;
    try {
      const wei = parseEther(a1MonthlyAmount);
      return wei / BigInt(SECONDS_IN_MONTH);
    } catch {
      return 0n;
    }
  }, [a1MonthlyAmount]);

  const a1RequiredBuffer = useMemo(() => {
    if (a1NewFlowRate === 0n || !liquidationPeriod) return 0n;
    return a1NewFlowRate * liquidationPeriod;
  }, [a1NewFlowRate, liquidationPeriod]);

  const a1WrapWei = useMemo(() => {
    if (!a1WrapAmount || !isPositiveDecimal(a1WrapAmount)) return 0n;
    try {
      return parseEther(a1WrapAmount);
    } catch {
      return 0n;
    }
  }, [a1WrapAmount]);

  const a1WrapUnits = useMemo(() => {
    if (!a1WrapAmount || !isPositiveDecimal(a1WrapAmount)) return 0n;
    try {
      return parseUnits(a1WrapAmount, underlyingDecimals);
    } catch {
      return 0n;
    }
  }, [a1WrapAmount, underlyingDecimals]);

  const a1AvailableSuper = adminBalance + a1WrapWei;
  const a1HasSufficientForBuffer = a1AvailableSuper >= a1RequiredBuffer;
  const a1WrapExceedsUnderlying =
    isSuperTokenWrapper === true && a1WrapUnits > underlyingValue;

  const a2DepositWei = useMemo(() => {
    if (!a2DepositAmount || !isPositiveDecimal(a2DepositAmount)) return 0n;
    try {
      return parseEther(a2DepositAmount);
    } catch {
      return 0n;
    }
  }, [a2DepositAmount]);

  const a2WrapWei = useMemo(() => {
    if (!a2WrapAmount || !isPositiveDecimal(a2WrapAmount)) return 0n;
    try {
      return parseEther(a2WrapAmount);
    } catch {
      return 0n;
    }
  }, [a2WrapAmount]);

  const a2WrapUnits = useMemo(() => {
    if (!a2WrapAmount || !isPositiveDecimal(a2WrapAmount)) return 0n;
    try {
      return parseUnits(a2WrapAmount, underlyingDecimals);
    } catch {
      return 0n;
    }
  }, [a2WrapAmount, underlyingDecimals]);

  const a2AvailableSuper = adminBalance + a2WrapWei;
  const a2HasSufficient = a2DepositWei > 0n && a2AvailableSuper >= a2DepositWei;
  const a2WrapExceedsUnderlying =
    isSuperTokenWrapper === true && a2WrapUnits > underlyingValue;

  const a2NewImpliedMax = useMemo(() => {
    if (!liquidationPeriod || liquidationPeriod === 0n) return null;
    if (splitterTokenBalance === null) return null;
    const newBalance = splitterTokenBalance + a2DepositWei;
    if (newBalance <= 0n) return 0n;
    return (newBalance * BigInt(SECONDS_IN_MONTH)) / liquidationPeriod;
  }, [splitterTokenBalance, a2DepositWei, liquidationPeriod]);

  // On-chain role authority is the gate for Close All. Subgraph isSuperAdmin
  // is supplementary — used to render the Danger Zone when wallets aren't yet
  // role-indexed but the user is a council manager. Either source unlocking is
  // sufficient because the contract revert is the hard gate.
  const canCloseStreams =
    hasDefaultAdminRole === true ||
    hasStreamAdminRole === true ||
    isSuperAdmin === true;

  const senderSnapshot = useActiveSplitterSenders({
    splitterAddress,
    tokenAddress: acceptedToken,
    chainId: chainId ?? 0,
    // Only fetch the senders snapshot for users who could actually close streams.
    enabled: !!splitterAddress && !!acceptedToken && canCloseStreams,
  });

  const validSenders = useMemo(
    () =>
      senderSnapshot.senders.filter((s): s is Address => ADDRESS_RE.test(s)),
    [senderSnapshot.senders],
  );

  const {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    executeTransactions,
  } = useTransactionsQueue();

  const {
    areTransactionsLoading: a2Loading,
    completedTransactions: a2Completed,
    transactionError: a2Error,
    executeTransactions: a2Execute,
  } = useTransactionsQueue();

  const handleAction1 = async () => {
    if (
      !address ||
      !acceptedToken ||
      !splitterAddress ||
      !chainId ||
      a1NewFlowRate === 0n ||
      !a1HasSufficientForBuffer
    ) {
      return;
    }

    const chainKey = chainId as keyof typeof hostAddress;
    const calls: TransactionCall[] = [];
    const batchOps = [];

    const needsApproval =
      isSuperTokenWrapper === true &&
      a1WrapUnits > BigInt(underlyingAllowance ?? 0);

    if (a1WrapWei > 0n) {
      const wrap = buildWrapCalls({
        tokenAddress: acceptedToken,
        wrapAmountWei: a1WrapWei,
        wrapAmountUnits: a1WrapUnits,
        isSuperTokenWrapper: isSuperTokenWrapper === true,
        isSuperTokenNative: isSuperTokenNative === true,
        tokenUnderlyingAddress: underlyingAddress,
        needsApproval,
      });
      calls.push(...wrap.calls);
      batchOps.push(...wrap.batchOps);
    }

    if (a1RequiredBuffer > 0n) {
      batchOps.push(
        buildSuperTokenTransferBatchOp({
          tokenAddress: acceptedToken,
          from: address,
          to: splitterAddress,
          amount: a1RequiredBuffer,
        }),
      );
    }

    batchOps.push(
      buildCreateFlowBatchOp({
        tokenAddress: acceptedToken,
        receiverAddress: splitterAddress,
        flowRate: a1NewFlowRate,
        chainId: chainKey,
      }),
    );

    const batchCall = buildBatchCall(batchOps, chainKey);
    if (batchCall) calls.push(batchCall);

    try {
      await executeTransactions(calls);
      setA1MonthlyAmount("");
      setA1WrapAmount("");
    } catch {
      // surface via transactionError
    }
  };

  const handleAction2 = async () => {
    if (
      !address ||
      !acceptedToken ||
      !splitterAddress ||
      !chainId ||
      a2DepositWei === 0n ||
      !a2HasSufficient
    ) {
      return;
    }

    const chainKey = chainId as keyof typeof hostAddress;
    const calls: TransactionCall[] = [];
    const batchOps = [];

    const needsApproval =
      isSuperTokenWrapper === true &&
      a2WrapUnits > BigInt(underlyingAllowance ?? 0);

    if (a2WrapWei > 0n) {
      const wrap = buildWrapCalls({
        tokenAddress: acceptedToken,
        wrapAmountWei: a2WrapWei,
        wrapAmountUnits: a2WrapUnits,
        isSuperTokenWrapper: isSuperTokenWrapper === true,
        isSuperTokenNative: isSuperTokenNative === true,
        tokenUnderlyingAddress: underlyingAddress,
        needsApproval,
      });
      calls.push(...wrap.calls);
      batchOps.push(...wrap.batchOps);
    }

    batchOps.push(
      buildSuperTokenTransferBatchOp({
        tokenAddress: acceptedToken,
        from: address,
        to: splitterAddress,
        amount: a2DepositWei,
      }),
    );

    const batchCall = buildBatchCall(batchOps, chainKey);
    if (batchCall) calls.push(batchCall);

    try {
      await a2Execute(calls);
      setA2DepositAmount("");
      setA2WrapAmount("");
    } catch {
      // surface via a2Error
    }
  };

  const handleCloseAll = async () => {
    if (
      !address ||
      !splitterAddress ||
      !chainId ||
      !publicClient ||
      a3ConfirmText !== "Close All" ||
      validSenders.length === 0
    ) {
      return;
    }

    setIsClosingAll(true);
    setCloseAllError("");

    try {
      const hash = await writeContract(wagmiConfig, {
        address: splitterAddress,
        abi: superAppSplitterAbi,
        functionName: "closeIncomingStreams",
        args: [validSenders],
        chainId,
      });
      await waitForReceipt(publicClient, hash);
      setCloseAllSuccess(true);
      setA3ConfirmText("");
    } catch (err) {
      console.error(err);
      setCloseAllError(sanitizeTxError(err));
    } finally {
      setIsClosingAll(false);
    }
  };

  // Renders

  const explorerHref =
    network?.blockExplorer && splitterAddress
      ? `${network.blockExplorer.replace(/\/$/, "")}/address/${splitterAddress}`
      : null;

  const tokenSymbol = tokenInfo?.symbol ?? "";

  const renderAction1Button = () => {
    if (!address) {
      return (
        <Button
          className="fs-lg fw-semi-bold py-4 rounded-4"
          onClick={() => openConnectModal?.()}
        >
          Connect Wallet
        </Button>
      );
    }
    if (connectedChain?.id !== chainId) {
      return (
        <Button
          className="fs-lg fw-semi-bold py-4 rounded-4"
          onClick={() => chainId && switchChain({ chainId })}
        >
          Switch Network
        </Button>
      );
    }
    return (
      <Button
        disabled={
          areTransactionsLoading ||
          a1NewFlowRate === 0n ||
          !a1HasSufficientForBuffer ||
          a1WrapExceedsUnderlying
        }
        className="fs-lg fw-semi-bold py-4 rounded-4"
        onClick={handleAction1}
      >
        {areTransactionsLoading ? (
          <>
            <Spinner size="sm" className="me-2" />
            {completedTransactions > 0 ? `${completedTransactions}` : null}
          </>
        ) : (
          "Open Stream"
        )}
      </Button>
    );
  };

  const renderAction2Button = () => {
    if (!address) {
      return (
        <Button
          className="fs-lg fw-semi-bold py-4 rounded-4"
          onClick={() => openConnectModal?.()}
        >
          Connect Wallet
        </Button>
      );
    }
    if (connectedChain?.id !== chainId) {
      return (
        <Button
          className="fs-lg fw-semi-bold py-4 rounded-4"
          onClick={() => chainId && switchChain({ chainId })}
        >
          Switch Network
        </Button>
      );
    }
    return (
      <Button
        disabled={
          a2Loading ||
          a2DepositWei === 0n ||
          !a2HasSufficient ||
          a2WrapExceedsUnderlying
        }
        className="fs-lg fw-semi-bold py-4 rounded-4"
        onClick={handleAction2}
      >
        {a2Loading ? (
          <>
            <Spinner size="sm" className="me-2" />
            {a2Completed > 0 ? `${a2Completed}` : null}
          </>
        ) : (
          "Deposit"
        )}
      </Button>
    );
  };

  if (!chainId || !councilId) {
    return (
      <span className="m-auto fs-4 fw-bold">
        Council not found.{" "}
        <Link
          href="/flow-councils/launch"
          className="text-primary text-decoration-none"
        >
          Launch one
        </Link>
      </span>
    );
  }

  if (!hasSplitter) {
    return (
      <>
        <Sidebar />
        <Stack
          direction="vertical"
          className={!isMobile ? "w-75 px-5" : "w-100 px-4"}
        >
          <Card className="bg-lace-100 rounded-4 border-0 p-4">
            <Card.Title className="fs-5 fw-semi-bold">Funding</Card.Title>
            <Card.Text className="text-info">
              No Super App splitter is configured for this council on this
              network. Funding actions are unavailable.
            </Card.Text>
          </Card>
        </Stack>
      </>
    );
  }

  return (
    <>
      <Sidebar />
      <Stack
        direction="vertical"
        className={!isMobile ? "w-75 px-5" : "w-100 px-4"}
        gap={4}
      >
        {/* Information panel */}
        <Card className="bg-lace-100 rounded-4 border-0 p-4">
          <Card.Header className="bg-transparent border-0 p-0">
            <Card.Title className="fs-5 fw-semi-bold">
              Super App Splitter
            </Card.Title>
            <Card.Text className="text-info mb-0">
              Donations stream to the splitter, which deducts the sustainability
              fee and forwards the rest to the distribution pool. The splitter
              must hold a Super Token buffer for the GDA leg of each stream
              (GDA cannot borrow protocol app credit). Retained fees accumulate
              in the splitter and back the buffer by design. The first stream
              is seeded by an admin so public donors never hit a revert.
            </Card.Text>
          </Card.Header>
          <Card.Body className="p-0 mt-4">
            <Stack
              direction={isMobile ? "vertical" : "horizontal"}
              gap={isMobile ? 2 : 4}
              className="align-items-start"
            >
              <Stack direction="vertical" gap={1} className="flex-grow-1">
                <Card.Text className="text-info mb-0 fw-semi-bold">
                  Splitter
                </Card.Text>
                {explorerHref ? (
                  <a
                    href={explorerHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-decoration-none fw-semi-bold"
                  >
                    {truncateStr(splitterAddress as string, 16)}
                  </a>
                ) : (
                  <span className="fw-semi-bold">
                    {truncateStr(splitterAddress as string, 16)}
                  </span>
                )}
              </Stack>
              <Stack direction="vertical" gap={1} className="flex-grow-1">
                <Card.Text className="text-info mb-0 fw-semi-bold">
                  Sustainability fee
                </Card.Text>
                <span className="fw-semi-bold">
                  {feePortion !== null ? `${feePortion}%` : <Spinner size="sm" />}
                </span>
              </Stack>
              <Stack direction="vertical" gap={1} className="flex-grow-1">
                <Card.Text className="text-info mb-0 fw-semi-bold">
                  Splitter balance
                </Card.Text>
                <span className="fw-semi-bold">
                  {splitterTokenBalance !== null ? (
                    `${Number(formatUnits(splitterTokenBalance, 18)).toLocaleString(
                      undefined,
                      { maximumFractionDigits: 4 },
                    )} ${tokenSymbol}`
                  ) : (
                    <Spinner size="sm" />
                  )}
                </span>
              </Stack>
              <Stack direction="vertical" gap={1} className="flex-grow-1">
                <Card.Text className="text-info mb-0 fw-semi-bold">
                  Implied max funding rate
                </Card.Text>
                <span className="fw-semi-bold">
                  {impliedMaxMonthlyRate !== null ? (
                    impliedMaxMonthlyRate === 0n ? (
                      "—"
                    ) : (
                      `${Number(formatUnits(impliedMaxMonthlyRate, 18)).toLocaleString(
                        undefined,
                        { maximumFractionDigits: 4 },
                      )} ${tokenSymbol}/mo`
                    )
                  ) : (
                    <Spinner size="sm" />
                  )}
                </span>
              </Stack>
            </Stack>
          </Card.Body>
        </Card>

        {/* Action 1 — Open primary stream */}
        <Card className="bg-lace-100 rounded-4 border-0 p-4">
          <Card.Header className="bg-transparent border-0 p-0">
            <Card.Title className="fs-5 fw-semi-bold">
              Open Primary Stream
            </Card.Title>
            <Card.Text className="text-info mb-0">
              Stream tokens from your wallet to the splitter and seed the
              required GDA buffer. The first donor cannot stream cleanly until
              this is done.
            </Card.Text>
          </Card.Header>
          <Card.Body className="p-0 mt-4">
            <Stack direction="vertical" gap={3}>
              <Form.Group>
                <Form.Label className="fw-semi-bold">
                  Monthly flow rate ({tokenSymbol})
                </Form.Label>
                <Form.Control
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={a1MonthlyAmount}
                  onChange={(e) => {
                    if (
                      e.target.value === "" ||
                      isPositiveDecimal(e.target.value)
                    ) {
                      setA1MonthlyAmount(e.target.value);
                    }
                  }}
                  className="border-0 rounded-4 bg-white py-4 fw-semi-bold"
                  style={{ paddingTop: 12, paddingBottom: 12 }}
                />
              </Form.Group>
              <Stack
                direction={isMobile ? "vertical" : "horizontal"}
                gap={isMobile ? 1 : 4}
              >
                <Stack direction="vertical" className="flex-grow-1">
                  <Card.Text className="text-info mb-0 fw-semi-bold">
                    Required buffer deposit
                  </Card.Text>
                  <span className="fw-semi-bold">
                    {liquidationPeriod
                      ? `${Number(formatUnits(a1RequiredBuffer, 18)).toLocaleString(
                          undefined,
                          { maximumFractionDigits: 6 },
                        )} ${tokenSymbol}`
                      : "—"}
                  </span>
                </Stack>
                <Stack direction="vertical" className="flex-grow-1">
                  <Card.Text className="text-info mb-0 fw-semi-bold">
                    Your {tokenSymbol} balance
                  </Card.Text>
                  <span className="fw-semi-bold">
                    {`${Number(formatUnits(adminBalance, 18)).toLocaleString(
                      undefined,
                      { maximumFractionDigits: 6 },
                    )} ${tokenSymbol}`}
                  </span>
                </Stack>
              </Stack>
              {isSuperTokenPure === false && (
                <Form.Group>
                  <Form.Label className="fw-semi-bold">
                    Wrap underlying (optional)
                    {underlyingBalance ? (
                      <span className="text-info ms-2 fw-normal">
                        Available:{" "}
                        {Number(
                          formatUnits(underlyingValue, underlyingDecimals),
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 6,
                        })}{" "}
                        {underlyingBalance.symbol}
                      </span>
                    ) : null}
                  </Form.Label>
                  <Form.Control
                    type="text"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={a1WrapAmount}
                    onChange={(e) => {
                      if (
                        e.target.value === "" ||
                        isPositiveDecimal(e.target.value)
                      ) {
                        setA1WrapAmount(e.target.value);
                      }
                    }}
                    className="border-0 rounded-4 bg-white py-4 fw-semi-bold"
                    style={{ paddingTop: 12, paddingBottom: 12 }}
                  />
                </Form.Group>
              )}
              {a1WrapExceedsUnderlying ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  Wrap amount exceeds your underlying balance.
                </Alert>
              ) : null}
              {!a1HasSufficientForBuffer && a1NewFlowRate > 0n ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  Required buffer exceeds your {tokenSymbol} balance plus the
                  amount you intend to wrap.
                </Alert>
              ) : null}
              {transactionError ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  {transactionError}
                </Alert>
              ) : null}
              {renderAction1Button()}
            </Stack>
          </Card.Body>
        </Card>

        {/* Action 2 — Direct deposit */}
        <Card className="bg-lace-100 rounded-4 border-0 p-4">
          <Card.Header className="bg-transparent border-0 p-0">
            <Card.Title className="fs-5 fw-semi-bold">Direct Deposit</Card.Title>
            <Card.Text className="text-info mb-0">
              Add Super Tokens directly to the splitter to grow its headroom.
              The implied max funding rate scales with the splitter balance.
            </Card.Text>
          </Card.Header>
          <Card.Body className="p-0 mt-4">
            <Stack direction="vertical" gap={3}>
              <Form.Group>
                <Form.Label className="fw-semi-bold">
                  Deposit amount ({tokenSymbol})
                </Form.Label>
                <Form.Control
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={a2DepositAmount}
                  onChange={(e) => {
                    if (
                      e.target.value === "" ||
                      isPositiveDecimal(e.target.value)
                    ) {
                      setA2DepositAmount(e.target.value);
                    }
                  }}
                  className="border-0 rounded-4 bg-white py-4 fw-semi-bold"
                  style={{ paddingTop: 12, paddingBottom: 12 }}
                />
              </Form.Group>
              <Stack direction="vertical" className="flex-grow-1">
                <Card.Text className="text-info mb-0 fw-semi-bold">
                  Your {tokenSymbol} balance
                </Card.Text>
                <span className="fw-semi-bold">
                  {`${Number(formatUnits(adminBalance, 18)).toLocaleString(
                    undefined,
                    { maximumFractionDigits: 6 },
                  )} ${tokenSymbol}`}
                </span>
              </Stack>
              {isSuperTokenPure === false && (
                <Form.Group>
                  <Form.Label className="fw-semi-bold">
                    Wrap underlying (optional)
                    {underlyingBalance ? (
                      <span className="text-info ms-2 fw-normal">
                        Available:{" "}
                        {Number(
                          formatUnits(underlyingValue, underlyingDecimals),
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 6,
                        })}{" "}
                        {underlyingBalance.symbol}
                      </span>
                    ) : null}
                  </Form.Label>
                  <Form.Control
                    type="text"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={a2WrapAmount}
                    onChange={(e) => {
                      if (
                        e.target.value === "" ||
                        isPositiveDecimal(e.target.value)
                      ) {
                        setA2WrapAmount(e.target.value);
                      }
                    }}
                    className="border-0 rounded-4 bg-white py-4 fw-semi-bold"
                    style={{ paddingTop: 12, paddingBottom: 12 }}
                  />
                </Form.Group>
              )}
              {a2DepositWei > 0n && a2NewImpliedMax !== null ? (
                <Stack direction="vertical" gap={1}>
                  {impliedMaxMonthlyRate !== null &&
                  impliedMaxMonthlyRate > 0n ? (
                    <Card.Text className="mb-0 fw-semi-bold">
                      Δ implied max:{" "}
                      <span className="text-success">
                        +
                        {Number(
                          formatUnits(
                            a2NewImpliedMax - impliedMaxMonthlyRate,
                            18,
                          ),
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })}{" "}
                        {tokenSymbol}/mo
                      </span>
                    </Card.Text>
                  ) : null}
                  <Card.Text className="mb-0 fw-semi-bold">
                    New implied max:{" "}
                    {Number(formatUnits(a2NewImpliedMax, 18)).toLocaleString(
                      undefined,
                      { maximumFractionDigits: 4 },
                    )}{" "}
                    {tokenSymbol}/mo
                  </Card.Text>
                </Stack>
              ) : null}
              {a2WrapExceedsUnderlying ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  Wrap amount exceeds your underlying balance.
                </Alert>
              ) : null}
              {a2DepositWei > 0n && !a2HasSufficient ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  Deposit exceeds your {tokenSymbol} balance plus the amount
                  you intend to wrap.
                </Alert>
              ) : null}
              {a2Error ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  {a2Error}
                </Alert>
              ) : null}
              {renderAction2Button()}
            </Stack>
          </Card.Body>
        </Card>

        {/* Danger Zone — Close All */}
        <Card className="rounded-4 border border-danger p-4">
          <Card.Header className="bg-transparent border-0 p-0">
            <Card.Title className="fs-5 fw-semi-bold text-danger">
              Danger Zone — Close All
            </Card.Title>
            <Card.Text className="text-info mb-0">
              Close every active incoming stream to the splitter in a single
              transaction. The on-chain closure is the round-end signal.
            </Card.Text>
          </Card.Header>
          <Card.Body className="p-0 mt-4">
            <Stack direction="vertical" gap={3}>
              {!canCloseStreams ? (
                <Card.Text className="text-info mb-0 fw-semi-bold">
                  Restricted to Super Admin.
                </Card.Text>
              ) : null}
              {isSuperAdmin &&
              hasStreamAdminRole === false &&
              hasDefaultAdminRole === false ? (
                <Alert variant="warning" className="mb-0 fw-semi-bold">
                  Your wallet is a Super Admin in the council registry but does
                  not hold STREAM_ADMIN_ROLE on the splitter contract. The
                  transaction will revert.
                </Alert>
              ) : null}
              {canCloseStreams ? (
                <Card.Text className="mb-0 fw-semi-bold">
                  {senderSnapshot.loading ? (
                    <Spinner size="sm" />
                  ) : senderSnapshot.blockNumber !== null ? (
                    `${validSenders.length} stream${validSenders.length === 1 ? "" : "s"} to close (snapshot at block ${senderSnapshot.blockNumber})`
                  ) : (
                    `${validSenders.length} stream${validSenders.length === 1 ? "" : "s"} to close`
                  )}
                </Card.Text>
              ) : null}
              <Form.Group>
                <Form.Label className="fw-semi-bold">
                  Type{" "}
                  <span className="text-danger">Close All</span> to confirm
                </Form.Label>
                <Form.Control
                  type="text"
                  disabled={!canCloseStreams}
                  value={a3ConfirmText}
                  onChange={(e) => setA3ConfirmText(e.target.value)}
                  className="border-0 rounded-4 bg-white py-4 fw-semi-bold"
                  style={{ paddingTop: 12, paddingBottom: 12 }}
                />
              </Form.Group>
              {closeAllError ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  {closeAllError}
                </Alert>
              ) : null}
              <Button
                variant="danger"
                disabled={
                  !canCloseStreams ||
                  isClosingAll ||
                  a3ConfirmText !== "Close All" ||
                  validSenders.length === 0
                }
                className="fs-lg fw-semi-bold py-4 rounded-4"
                onClick={handleCloseAll}
              >
                {isClosingAll ? <Spinner size="sm" /> : "Close All"}
              </Button>
            </Stack>
          </Card.Body>
        </Card>

        {/* Wizard nav */}
        <Stack direction="vertical" gap={3} className="mb-30">
          <Button
            variant="secondary"
            className="fs-lg fw-semi-bold py-4 rounded-4"
            onClick={() =>
              router.push(
                `/flow-councils/communications/${chainId}/${councilId}`,
              )
            }
          >
            Next
          </Button>
        </Stack>

        <Toast
          show={closeAllSuccess}
          delay={4000}
          autohide={true}
          onClose={() => setCloseAllSuccess(false)}
          className="position-fixed bottom-0 end-0 m-4 bg-success p-4 fw-semi-bold fs-6 text-white"
        >
          Streams closed.
        </Toast>
      </Stack>
    </>
  );
}
