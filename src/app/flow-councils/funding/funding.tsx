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
import { networks, isSplitterFactoryDeployed } from "@/lib/networks";
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
  return /^\d+(\.\d*)?$|^\d*\.\d+$/.test(s);
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
  const factoryDeployed = isSplitterFactoryDeployed(network);

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
    pollInterval: 10000,
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

  const [streamMonthlyAmount, setStreamMonthlyAmount] = useState("");
  const [streamWrapAmount, setStreamWrapAmount] = useState("");

  const [depositAmount, setDepositAmount] = useState("");
  const [depositWrapAmount, setDepositWrapAmount] = useState("");

  const [closeAllConfirmText, setCloseAllConfirmText] = useState("");
  const [closeAllError, setCloseAllError] = useState("");
  const [closeAllSuccess, setCloseAllSuccess] = useState(false);
  const [isClosingAll, setIsClosingAll] = useState(false);

  const streamFlowRate = useMemo(() => {
    if (!streamMonthlyAmount || !isPositiveDecimal(streamMonthlyAmount)) return 0n;
    try {
      const wei = parseEther(streamMonthlyAmount);
      return wei / BigInt(SECONDS_IN_MONTH);
    } catch {
      return 0n;
    }
  }, [streamMonthlyAmount]);

  const streamRequiredBuffer = useMemo(() => {
    if (streamFlowRate === 0n || !liquidationPeriod) return 0n;
    return streamFlowRate * liquidationPeriod;
  }, [streamFlowRate, liquidationPeriod]);

  const streamWrapWei = useMemo(() => {
    if (!streamWrapAmount || !isPositiveDecimal(streamWrapAmount)) return 0n;
    try {
      return parseEther(streamWrapAmount);
    } catch {
      return 0n;
    }
  }, [streamWrapAmount]);

  const streamWrapUnits = useMemo(() => {
    if (!streamWrapAmount || !isPositiveDecimal(streamWrapAmount)) return 0n;
    try {
      return parseUnits(streamWrapAmount, underlyingDecimals);
    } catch {
      return 0n;
    }
  }, [streamWrapAmount, underlyingDecimals]);

  const streamAvailableSuper = adminBalance + streamWrapWei;
  const streamHasSufficientForBuffer = streamAvailableSuper >= streamRequiredBuffer;
  const streamWrapExceedsUnderlying =
    isSuperTokenWrapper === true && streamWrapUnits > underlyingValue;

  const depositWei = useMemo(() => {
    if (!depositAmount || !isPositiveDecimal(depositAmount)) return 0n;
    try {
      return parseEther(depositAmount);
    } catch {
      return 0n;
    }
  }, [depositAmount]);

  const depositWrapWei = useMemo(() => {
    if (!depositWrapAmount || !isPositiveDecimal(depositWrapAmount)) return 0n;
    try {
      return parseEther(depositWrapAmount);
    } catch {
      return 0n;
    }
  }, [depositWrapAmount]);

  const depositWrapUnits = useMemo(() => {
    if (!depositWrapAmount || !isPositiveDecimal(depositWrapAmount)) return 0n;
    try {
      return parseUnits(depositWrapAmount, underlyingDecimals);
    } catch {
      return 0n;
    }
  }, [depositWrapAmount, underlyingDecimals]);

  const depositAvailableSuper = adminBalance + depositWrapWei;
  const depositHasSufficient = depositWei > 0n && depositAvailableSuper >= depositWei;
  const depositWrapExceedsUnderlying =
    isSuperTokenWrapper === true && depositWrapUnits > underlyingValue;

  const depositNewImpliedMax = useMemo(() => {
    if (!liquidationPeriod || liquidationPeriod === 0n) return null;
    if (splitterTokenBalance === null) return null;
    const newBalance = splitterTokenBalance + depositWei;
    if (newBalance <= 0n) return 0n;
    return (newBalance * BigInt(SECONDS_IN_MONTH)) / liquidationPeriod;
  }, [splitterTokenBalance, depositWei, liquidationPeriod]);

  // canCloseStreams gates rendering the Danger Zone. Subgraph isSuperAdmin lets
  // council managers see the panel before role indexing catches up; on-chain
  // roles override and unlock submission.
  const canCloseStreams =
    hasDefaultAdminRole === true ||
    hasStreamAdminRole === true ||
    isSuperAdmin === true;

  // canSubmitClose gates the actual button. If both on-chain roles are confirmed
  // false, the contract will revert — keep the button disabled instead of just
  // warning. Treat null (still loading) as not yet definitively false.
  const onChainRolesDefinitivelyFalse =
    hasDefaultAdminRole === false && hasStreamAdminRole === false;
  const canSubmitClose = canCloseStreams && !onChainRolesDefinitivelyFalse;

  const senderSnapshot = useActiveSplitterSenders({
    splitterAddress,
    tokenAddress: acceptedToken,
    chainId: chainId ?? 0,
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
    areTransactionsLoading: depositLoading,
    completedTransactions: depositCompleted,
    transactionError: depositError,
    executeTransactions: depositExecute,
  } = useTransactionsQueue();

  const handleOpenStream = async () => {
    if (
      !address ||
      !acceptedToken ||
      !splitterAddress ||
      !chainId ||
      streamFlowRate === 0n ||
      !streamHasSufficientForBuffer
    ) {
      return;
    }

    const chainKey = chainId as keyof typeof hostAddress;
    const calls: TransactionCall[] = [];
    const batchOps = [];

    const needsApproval =
      isSuperTokenWrapper === true &&
      streamWrapUnits > BigInt(underlyingAllowance ?? 0);

    if (streamWrapWei > 0n) {
      const wrap = buildWrapCalls({
        tokenAddress: acceptedToken,
        wrapAmountWei: streamWrapWei,
        wrapAmountUnits: streamWrapUnits,
        isSuperTokenWrapper: isSuperTokenWrapper === true,
        isSuperTokenNative: isSuperTokenNative === true,
        tokenUnderlyingAddress: underlyingAddress,
        needsApproval,
      });
      calls.push(...wrap.calls);
      batchOps.push(...wrap.batchOps);
    }

    if (streamRequiredBuffer > 0n) {
      batchOps.push(
        buildSuperTokenTransferBatchOp({
          tokenAddress: acceptedToken,
          from: address,
          to: splitterAddress,
          amount: streamRequiredBuffer,
        }),
      );
    }

    batchOps.push(
      buildCreateFlowBatchOp({
        tokenAddress: acceptedToken,
        receiverAddress: splitterAddress,
        flowRate: streamFlowRate,
        chainId: chainKey,
      }),
    );

    const batchCall = buildBatchCall(batchOps, chainKey);
    if (batchCall) calls.push(batchCall);

    try {
      await executeTransactions(calls);
      setStreamMonthlyAmount("");
      setStreamWrapAmount("");
    } catch {
      /* empty */
    }
  };

  const handleDeposit = async () => {
    if (
      !address ||
      !acceptedToken ||
      !splitterAddress ||
      !chainId ||
      depositWei === 0n ||
      !depositHasSufficient
    ) {
      return;
    }

    const chainKey = chainId as keyof typeof hostAddress;
    const calls: TransactionCall[] = [];
    const batchOps = [];

    const needsApproval =
      isSuperTokenWrapper === true &&
      depositWrapUnits > BigInt(underlyingAllowance ?? 0);

    if (depositWrapWei > 0n) {
      const wrap = buildWrapCalls({
        tokenAddress: acceptedToken,
        wrapAmountWei: depositWrapWei,
        wrapAmountUnits: depositWrapUnits,
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
        amount: depositWei,
      }),
    );

    const batchCall = buildBatchCall(batchOps, chainKey);
    if (batchCall) calls.push(batchCall);

    try {
      await depositExecute(calls);
      setDepositAmount("");
      setDepositWrapAmount("");
    } catch {
      /* empty */
    }
  };

  const handleCloseAll = async () => {
    if (
      !address ||
      !splitterAddress ||
      !chainId ||
      !publicClient ||
      closeAllConfirmText !== "Close All" ||
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
      setCloseAllConfirmText("");
      await senderSnapshot.refetch();
    } catch (err) {
      console.error(err);
      setCloseAllError(sanitizeTxError(err));
    } finally {
      setIsClosingAll(false);
    }
  };

  const explorerHref =
    network?.blockExplorer && splitterAddress
      ? `${network.blockExplorer.replace(/\/$/, "")}/address/${splitterAddress}`
      : null;

  const tokenSymbol = tokenInfo?.symbol ?? "";

  const renderStreamButton = () => {
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
          streamFlowRate === 0n ||
          !streamHasSufficientForBuffer ||
          streamWrapExceedsUnderlying
        }
        className="fs-lg fw-semi-bold py-4 rounded-4"
        onClick={handleOpenStream}
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

  const renderDepositButton = () => {
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
          depositLoading ||
          depositWei === 0n ||
          !depositHasSufficient ||
          depositWrapExceedsUnderlying
        }
        className="fs-lg fw-semi-bold py-4 rounded-4"
        onClick={handleDeposit}
      >
        {depositLoading ? (
          <>
            <Spinner size="sm" className="me-2" />
            {depositCompleted > 0 ? `${depositCompleted}` : null}
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
                  value={streamMonthlyAmount}
                  onChange={(e) => {
                    if (
                      e.target.value === "" ||
                      isPositiveDecimal(e.target.value)
                    ) {
                      setStreamMonthlyAmount(e.target.value);
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
                      ? `${Number(formatUnits(streamRequiredBuffer, 18)).toLocaleString(
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
                    value={streamWrapAmount}
                    onChange={(e) => {
                      if (
                        e.target.value === "" ||
                        isPositiveDecimal(e.target.value)
                      ) {
                        setStreamWrapAmount(e.target.value);
                      }
                    }}
                    className="border-0 rounded-4 bg-white py-4 fw-semi-bold"
                    style={{ paddingTop: 12, paddingBottom: 12 }}
                  />
                </Form.Group>
              )}
              {streamWrapExceedsUnderlying ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  Wrap amount exceeds your underlying balance.
                </Alert>
              ) : null}
              {!streamHasSufficientForBuffer && streamFlowRate > 0n ? (
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
              {renderStreamButton()}
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
                  value={depositAmount}
                  onChange={(e) => {
                    if (
                      e.target.value === "" ||
                      isPositiveDecimal(e.target.value)
                    ) {
                      setDepositAmount(e.target.value);
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
                    value={depositWrapAmount}
                    onChange={(e) => {
                      if (
                        e.target.value === "" ||
                        isPositiveDecimal(e.target.value)
                      ) {
                        setDepositWrapAmount(e.target.value);
                      }
                    }}
                    className="border-0 rounded-4 bg-white py-4 fw-semi-bold"
                    style={{ paddingTop: 12, paddingBottom: 12 }}
                  />
                </Form.Group>
              )}
              {depositWei > 0n && depositNewImpliedMax !== null ? (
                <Stack direction="vertical" gap={1}>
                  {impliedMaxMonthlyRate !== null &&
                  impliedMaxMonthlyRate > 0n ? (
                    <Card.Text className="mb-0 fw-semi-bold">
                      Δ implied max:{" "}
                      <span className="text-success">
                        +
                        {Number(
                          formatUnits(
                            depositNewImpliedMax - impliedMaxMonthlyRate,
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
                    {Number(formatUnits(depositNewImpliedMax, 18)).toLocaleString(
                      undefined,
                      { maximumFractionDigits: 4 },
                    )}{" "}
                    {tokenSymbol}/mo
                  </Card.Text>
                </Stack>
              ) : null}
              {depositWrapExceedsUnderlying ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  Wrap amount exceeds your underlying balance.
                </Alert>
              ) : null}
              {depositWei > 0n && !depositHasSufficient ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  Deposit exceeds your {tokenSymbol} balance plus the amount
                  you intend to wrap.
                </Alert>
              ) : null}
              {depositError ? (
                <Alert variant="danger" className="mb-0 fw-semi-bold">
                  {depositError}
                </Alert>
              ) : null}
              {renderDepositButton()}
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
              {canCloseStreams && senderSnapshot.truncated ? (
                <Alert variant="warning" className="mb-0 fw-semi-bold">
                  Showing the first {validSenders.length} active senders. There
                  are likely more — run Close All again after this transaction
                  to close the remaining streams.
                </Alert>
              ) : null}
              <Form.Group>
                <Form.Label className="fw-semi-bold">
                  Type{" "}
                  <span className="text-danger">Close All</span> to confirm
                </Form.Label>
                <Form.Control
                  type="text"
                  disabled={!canSubmitClose}
                  value={closeAllConfirmText}
                  onChange={(e) => setCloseAllConfirmText(e.target.value)}
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
                  !canSubmitClose ||
                  isClosingAll ||
                  closeAllConfirmText !== "Close All" ||
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
