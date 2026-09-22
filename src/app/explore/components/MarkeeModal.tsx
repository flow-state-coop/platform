"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import CloseButton from "react-bootstrap/CloseButton";
import Form from "react-bootstrap/Form";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import Image from "react-bootstrap/Image";
import Nav from "react-bootstrap/Nav";
import Tab from "react-bootstrap/Tab";
import { Address, PublicClient, formatEther, parseEther } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { markeeLeaderboardAbi } from "@/lib/abi/markee";
import { ZERO_ADDRESS } from "@/lib/constants";
import { truncateAddress } from "@/lib/utils";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import {
  MarkeeBoard,
  useMarkeeBacker,
  useSuperfluidAgreements,
} from "../hooks/markee";
import {
  FLOW_STATE_MARKEE_ADDRESS,
  GAS_RESERVE_WEI,
  MARKEE_CHAIN_ID,
  MARKEE_NETWORK_URL,
  MONOSPACE_FONT,
  StreamFunding,
  StreamMode,
  buildCreateMarkeeCall,
  buildStreamCalls,
  buildUpdateMessageCall,
  ceilToThousandthEth,
  computeStreamFunding,
  displayOwnerName,
  flaggedKey,
  formatEthAmountInput,
  formatMonthlyRate,
  formatRunway,
  isBelowMinimumRate,
  maxMonthlyFor,
  monthlyToRatePerSec,
  monthlyToWin,
  buildStopStreamCall,
  buildWithdrawDepositCall,
  parseCreatedMarkee,
  runwaySeconds,
} from "../lib/markee";

type MarkeeTab = "buy" | "back" | "edit";

type MarkeeModalProps = {
  isOpen: boolean;
  board: MarkeeBoard;
  flagged: Set<string>;
  onConnectWallet: () => void;
  onClose: () => void;
  onTxSuccess: () => void;
};

const MAX_AMOUNT_DIGITS = 8;
const POOL_POLL_ATTEMPTS = 12;
const POOL_POLL_INTERVAL_MS = 1500;

class MarkeeFlowError extends Error {}

function sanitizeAmountInput(value: string): string | null {
  if (!/^\d*\.?\d*$/.test(value)) {
    return null;
  }

  if (value.replace(/\D/g, "").length > MAX_AMOUNT_DIGITS) {
    return null;
  }

  return value;
}

function parseEthInput(value: string): bigint | null {
  if (!value) {
    return null;
  }

  try {
    return parseEther(value);
  } catch {
    return null;
  }
}

// createMarkee deploys the refund pool in the same tx, but the RPC can lag
// behind the receipt, so poll until poolOf resolves.
async function waitForPool(publicClient: PublicClient, markee: Address) {
  for (let attempt = 0; attempt < POOL_POLL_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, POOL_POLL_INTERVAL_MS),
      );
    }

    const pool = await publicClient.readContract({
      address: FLOW_STATE_MARKEE_ADDRESS,
      abi: markeeLeaderboardAbi,
      functionName: "poolOf",
      args: [markee],
    });

    if (pool !== ZERO_ADDRESS) {
      return pool;
    }
  }

  throw new MarkeeFlowError("The refund pool is not ready yet, try again");
}

function RateSection({
  amount,
  onAmountChange,
  presets,
  placeholder,
  isConnected,
  ethBalance,
  ethxBalance,
  ratePerSec,
  funding,
  runway,
  isBelowMinimum,
  minimumMonthly,
}: {
  amount: string;
  onAmountChange: (value: string) => void;
  presets: { label: string; value: string }[];
  placeholder: string;
  isConnected: boolean;
  ethBalance: bigint;
  ethxBalance: bigint;
  ratePerSec: bigint;
  funding: StreamFunding;
  runway: bigint | null;
  isBelowMinimum: boolean;
  minimumMonthly: string | null;
}) {
  return (
    <Form.Group>
      <Form.Label className="fw-semi-bold">ETH per month</Form.Label>
      {presets.length > 0 && (
        <Stack direction="horizontal" gap={2} className="mb-2 flex-wrap">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="outline-primary"
              size="sm"
              className="rounded-4 fw-semi-bold px-3"
              onClick={() => onAmountChange(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </Stack>
      )}
      <Form.Control
        type="text"
        inputMode="decimal"
        value={amount}
        placeholder={placeholder}
        className="bg-white border border-2 border-dark rounded-4 py-2 px-3"
        onChange={(e) => {
          const sanitized = sanitizeAmountInput(e.target.value);

          if (sanitized !== null) {
            onAmountChange(sanitized);
          }
        }}
      />
      {isConnected && (
        <Stack
          direction="horizontal"
          gap={3}
          className="flex-wrap fs-sm text-secondary mt-1"
        >
          <span>ETH: {parseFloat(formatEther(ethBalance)).toFixed(4)}</span>
          <span>ETHx: {parseFloat(formatEther(ethxBalance)).toFixed(4)}</span>
        </Stack>
      )}
      {isConnected && ratePerSec > 0n && !isBelowMinimum && (
        <p className="fs-sm mb-0 mt-2">
          {funding.wrapValue > 0n && (
            <>
              Wraps {parseFloat(formatEther(funding.wrapValue)).toFixed(4)} ETH
              to ETHx
              {funding.depositTopUp > 0n &&
                ` (${parseFloat(formatEther(funding.depositTopUp)).toFixed(6)} refundable deposit)`}
              {" · "}
            </>
          )}
          {formatRunway(runway)}
        </p>
      )}
      {isBelowMinimum && minimumMonthly !== null && (
        <p className="text-danger fs-sm mb-0 mt-2">
          The minimum is {minimumMonthly} ETH per month
        </p>
      )}
      {isConnected && ratePerSec > 0n && funding.isInsufficient && (
        <p className="text-danger fs-sm mb-0 mt-2">
          Not enough ETH on Base to fund this stream
        </p>
      )}
    </Form.Group>
  );
}

export default function MarkeeModal(props: MarkeeModalProps) {
  const { isOpen, board, flagged, onConnectWallet, onClose, onTxSuccess } =
    props;

  const [activeTab, setActiveTab] = useState<MarkeeTab>("buy");
  const [message, setMessage] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [selectedMarkee, setSelectedMarkee] = useState<Address | null>(null);
  const [editMarkee, setEditMarkee] = useState<Address | null>(null);
  const [editText, setEditText] = useState("");
  const [pendingLabel, setPendingLabel] = useState("");
  const [flowError, setFlowError] = useState("");
  const [successHash, setSuccessHash] = useState<string | null>(null);

  const createdRef = useRef<{ markee: Address; pool: Address } | null>(null);

  const { address, isConnected, chainId } = useAccount();
  const isOnBase = isConnected && chainId === MARKEE_CHAIN_ID;
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: MARKEE_CHAIN_ID });
  const backer = useMarkeeBacker(address, isOpen);
  const { cfaAgreement, gdaAgreement } = useSuperfluidAgreements(isOpen);
  const { transactionError, executeTransactions } = useTransactionsQueue();

  const entries = useMemo(
    () =>
      board.entries.filter((entry) => !flagged.has(flaggedKey(entry.address))),
    [board.entries, flagged],
  );
  const ownedEntries = useMemo(
    () =>
      address
        ? entries.filter(
            (entry) => entry.owner.toLowerCase() === address.toLowerCase(),
          )
        : [],
    [entries, address],
  );
  const topEntry = board.topEntry;
  const isBacking = backer.backerMarkee !== ZERO_ADDRESS;

  useEffect(() => {
    if (isBacking && selectedMarkee === null) {
      setSelectedMarkee(backer.backerMarkee);
    }
  }, [isBacking, backer.backerMarkee, selectedMarkee]);

  useEffect(() => {
    if (ownedEntries.length > 0 && editMarkee === null) {
      setEditMarkee(ownedEntries[0].address);
      setEditText(ownedEntries[0].message);
    }
  }, [ownedEntries, editMarkee]);

  const selectedEntry =
    entries.find((entry) => entry.address === selectedMarkee) ?? null;
  const editEntry =
    ownedEntries.find((entry) => entry.address === editMarkee) ?? null;
  const { data: selectedPool } = useReadContract({
    chainId: MARKEE_CHAIN_ID,
    address: FLOW_STATE_MARKEE_ADDRESS,
    abi: markeeLeaderboardAbi,
    functionName: "poolOf",
    args: selectedMarkee ? [selectedMarkee] : undefined,
    query: { enabled: isOpen && selectedMarkee !== null },
  });

  const minimumMonthlyRate = board.minimumMonthlyRate;
  const minimumMonthly =
    minimumMonthlyRate !== null
      ? formatEthAmountInput(ceilToThousandthEth(minimumMonthlyRate))
      : null;
  const monthlyWei = parseEthInput(monthlyAmount);
  const ratePerSec =
    monthlyWei !== null && minimumMonthlyRate !== null
      ? monthlyToRatePerSec(monthlyWei, minimumMonthlyRate)
      : 0n;
  const isBelowMinimum =
    ratePerSec > 0n &&
    minimumMonthlyRate !== null &&
    isBelowMinimumRate(ratePerSec, minimumMonthlyRate);

  const mode: StreamMode =
    activeTab === "back" &&
    selectedMarkee !== null &&
    selectedMarkee === backer.backerMarkee
      ? "update"
      : isBacking
        ? "move"
        : "open";
  const funding = computeStreamFunding({
    ratePerSec,
    ethxBalance: backer.ethxBalance,
    ethBalance: backer.ethBalance,
    existingDeposit: backer.backerDeposit,
  });
  const netOutflowAfter =
    ratePerSec - backer.accountNetFlowRate - backer.flowRateToBoard;
  const runway = runwaySeconds(funding.prefund, netOutflowAfter);

  const spendable = backer.ethBalance + backer.ethxBalance;
  const targetIsTop =
    activeTab === "back" &&
    topEntry !== null &&
    selectedMarkee === topEntry.address;
  const targetRate =
    activeTab === "back"
      ? (selectedEntry?.rate ?? 0n) -
        (mode === "update" ? backer.flowRateToBoard : 0n)
      : 0n;
  const presets = [
    ...(minimumMonthly !== null
      ? [{ label: "MIN", value: minimumMonthly }]
      : []),
    ...(isConnected && spendable > GAS_RESERVE_WEI
      ? [
          {
            label: "MAX",
            value: formatEthAmountInput(
              maxMonthlyFor(spendable - GAS_RESERVE_WEI),
            ),
          },
        ]
      : []),
    ...(topEntry !== null && minimumMonthlyRate !== null && !targetIsTop
      ? [
          {
            label: "WIN",
            value: formatEthAmountInput(
              monthlyToWin(topEntry.rate, targetRate, minimumMonthlyRate),
            ),
          },
        ]
      : []),
  ];

  const isPending = pendingLabel !== "";
  const isStreamReady =
    !!cfaAgreement && !!gdaAgreement && backer.isLoaded && !!publicClient;
  const isRateInvalid =
    ratePerSec <= 0n ||
    isBelowMinimum ||
    funding.isInsufficient ||
    (mode === "update" && ratePerSec === backer.flowRateToBoard);
  const isBuyDisabled =
    isPending ||
    (isOnBase && (!isStreamReady || !message.trim() || isRateInvalid));
  const isBackDisabled =
    isPending ||
    (isOnBase &&
      (!isStreamReady ||
        selectedEntry === null ||
        !selectedPool ||
        selectedPool === ZERO_ADDRESS ||
        isRateInvalid));
  const isEditDisabled =
    isPending ||
    (isOnBase &&
      (editEntry === null ||
        !editText.trim() ||
        editText.trim() === editEntry.message));

  const handleSelectTab = (key: string | null) => {
    if (key === "buy" || key === "back" || key === "edit") {
      setFlowError("");
      setActiveTab(key);
    }
  };

  const handleMessageChange = (value: string) => {
    createdRef.current = null;
    setMessage(value);
  };

  const runFlow = async (flow: () => Promise<`0x${string}` | undefined>) => {
    setFlowError("");

    try {
      const hash = await flow();

      if (hash) {
        setSuccessHash(hash);
        onTxSuccess();
      }
    } catch (err) {
      console.error(err);

      if (err instanceof MarkeeFlowError) {
        setFlowError(err.message);
      }
    }

    setPendingLabel("");
  };

  const handleStream = () =>
    runFlow(async () => {
      if (!address || !publicClient || !cfaAgreement || !gdaAgreement) {
        return;
      }

      let markee = selectedMarkee;
      let pool = selectedPool ?? null;

      if (activeTab === "buy") {
        if (!createdRef.current) {
          setPendingLabel("Creating message");

          const receipts = await executeTransactions([
            buildCreateMarkeeCall(message.trim(), buyerName.trim()),
          ]);
          const created = parseCreatedMarkee(receipts);

          if (!created) {
            throw new MarkeeFlowError(
              "Could not find the new message on-chain, try again",
            );
          }

          createdRef.current = {
            markee: created,
            pool: await waitForPool(publicClient, created),
          };
        }

        markee = createdRef.current.markee;
        pool = createdRef.current.pool;
      }

      if (!markee || !pool || pool === ZERO_ADDRESS) {
        throw new MarkeeFlowError(
          "The refund pool is not ready yet, try again",
        );
      }

      setPendingLabel(
        funding.depositTopUp > backer.allowance
          ? "Approving deposit"
          : "Starting stream",
      );

      const receipts = await executeTransactions(
        buildStreamCalls({
          mode,
          backer: address,
          markee,
          pool,
          ratePerSec,
          depositTopUp: funding.depositTopUp,
          wrapValue: funding.wrapValue,
          cfaAgreement,
          gdaAgreement,
          allowance: backer.allowance,
        }),
      );

      return receipts[receipts.length - 1]?.transactionHash;
    });

  const handleUpdateMessage = () =>
    runFlow(async () => {
      if (!editEntry) {
        return;
      }

      setPendingLabel("Updating message");

      const receipts = await executeTransactions([
        buildUpdateMessageCall(editEntry.address, editText.trim()),
      ]);

      return receipts[receipts.length - 1]?.transactionHash;
    });

  const handleStopStream = () =>
    runFlow(async () => {
      setPendingLabel("Stopping stream");

      const receipts = await executeTransactions([buildStopStreamCall()]);

      return receipts[receipts.length - 1]?.transactionHash;
    });

  const handleWithdrawDeposit = () =>
    runFlow(async () => {
      setPendingLabel("Withdrawing deposit");

      const receipts = await executeTransactions([buildWithdrawDepositCall()]);

      return receipts[receipts.length - 1]?.transactionHash;
    });

  const handleAction = (action: () => void) =>
    !isConnected
      ? onConnectWallet()
      : !isOnBase
        ? switchChain({ chainId: MARKEE_CHAIN_ID })
        : action();

  const errorAlert =
    transactionError || flowError ? (
      <Alert variant="danger" className="rounded-4 fs-sm p-3 mt-3 mb-0">
        {transactionError || flowError}
      </Alert>
    ) : null;

  const submitLabel = (label: string) =>
    isPending ? (
      <>
        <Spinner size="sm" className="me-2" />
        {pendingLabel}
      </>
    ) : (
      label
    );

  const rateSection = (
    <RateSection
      amount={monthlyAmount}
      onAmountChange={setMonthlyAmount}
      presets={presets}
      placeholder={minimumMonthly ?? "0.0"}
      isConnected={isConnected}
      ethBalance={backer.ethBalance}
      ethxBalance={backer.ethxBalance}
      ratePerSec={ratePerSec}
      funding={funding}
      runway={runway}
      isBelowMinimum={isBelowMinimum}
      minimumMonthly={minimumMonthly}
    />
  );

  return (
    <Stack direction="vertical" className="p-4">
      <Stack
        direction="horizontal"
        className="justify-content-between align-items-center mb-3"
      >
        <Stack direction="horizontal" gap={2} className="align-items-center">
          <Image src="/logo-blue.svg" alt="Flow State" width={28} height={28} />
          <span className="fs-5 fw-semi-bold">Flow State Markee</span>
        </Stack>
        <CloseButton onClick={onClose} />
      </Stack>
      {successHash !== null ? (
        <Stack
          direction="vertical"
          gap={3}
          className="align-items-center text-center py-5"
        >
          <Image src="/check-circle.svg" alt="" width={64} height={64} />
          <span className="fs-4 fw-semi-bold">Transaction confirmed!</span>
          <a
            href={`https://basescan.org/tx/${successHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="fw-semi-bold"
          >
            View on Basescan
          </a>
          <span className="text-info fs-sm">Refreshing in a moment...</span>
        </Stack>
      ) : (
        <>
          {topEntry !== null && (
            <div className="border border-2 border-dark rounded-4 p-3 mb-4">
              <span
                className="d-block"
                style={{
                  fontFamily: MONOSPACE_FONT,
                  fontSize: 14,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                }}
              >
                {flagged.has(flaggedKey(topEntry.address))
                  ? "Content unavailable"
                  : topEntry.message}
              </span>
              <Stack
                direction="horizontal"
                className="justify-content-between mt-1"
              >
                <span className="text-secondary fs-sm">
                  - {displayOwnerName(topEntry.name || topEntry.owner)}
                </span>
                <span className="fs-sm fw-semi-bold">
                  {formatMonthlyRate(topEntry.rate)} ETH/mo
                </span>
              </Stack>
            </div>
          )}
          <Tab.Container activeKey={activeTab} onSelect={handleSelectTab}>
            <Nav className="gap-2 mb-4 border-0 flex-nowrap">
              {[
                { key: "buy", label: "Buy a Message" },
                { key: "back", label: "Back a Message" },
                ...(ownedEntries.length > 0
                  ? [{ key: "edit", label: "Edit Message" }]
                  : []),
              ].map(({ key, label }) => (
                <Nav.Item key={key} className="flex-grow-1">
                  <Nav.Link
                    eventKey={key}
                    className={`py-2 px-3 rounded-4 text-center fw-semi-bold border border-2 border-primary ${
                      activeTab === key
                        ? "bg-primary text-white"
                        : "bg-white text-primary"
                    }`}
                  >
                    {label}
                  </Nav.Link>
                </Nav.Item>
              ))}
            </Nav>
            <Tab.Content>
              <Tab.Pane eventKey="buy">
                <Form.Group className="mb-4">
                  <Form.Label className="fw-semi-bold">Message</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={message}
                    maxLength={board.maxMessageLength ?? undefined}
                    placeholder="Your message"
                    className="bg-white border border-2 border-dark rounded-4 py-2 px-3"
                    style={{ fontFamily: MONOSPACE_FONT, textAlign: "left" }}
                    onChange={(e) => handleMessageChange(e.target.value)}
                  />
                  {board.maxMessageLength !== null && (
                    <div className="text-end text-secondary fs-sm mt-1">
                      {message.length}/{board.maxMessageLength}
                    </div>
                  )}
                </Form.Group>
                <Form.Group className="mb-4">
                  <Form.Label className="fw-semi-bold">
                    Name (optional)
                  </Form.Label>
                  <Form.Control
                    type="text"
                    value={buyerName}
                    maxLength={board.maxNameLength ?? undefined}
                    placeholder="Shown with your message"
                    className="bg-white border border-2 border-dark rounded-4 py-2 px-3"
                    onChange={(e) => setBuyerName(e.target.value)}
                  />
                </Form.Group>
                {rateSection}
                {isBacking && (
                  <p className="fs-sm text-secondary mt-3 mb-0">
                    Your current stream to another message will be closed and
                    redirected to the new one.
                  </p>
                )}
                {errorAlert}
                <Button
                  className="w-100 rounded-4 py-3 fw-semi-bold mt-4"
                  disabled={isBuyDisabled}
                  onClick={() => handleAction(handleStream)}
                >
                  {submitLabel("Start Streaming")}
                </Button>
              </Tab.Pane>
              <Tab.Pane eventKey="back">
                {board.isError ? (
                  <Alert variant="danger" className="rounded-4 fs-sm p-3">
                    Couldn&apos;t load the current messages. Please try again
                    later.
                  </Alert>
                ) : board.isLoading ? (
                  <div className="text-center py-5">
                    <Spinner />
                  </div>
                ) : entries.length === 0 ? (
                  <p className="text-secondary py-3">No messages available.</p>
                ) : (
                  <>
                    <Stack
                      direction="vertical"
                      gap={2}
                      className="mb-4"
                      style={{ maxHeight: 280, overflowY: "auto" }}
                    >
                      {entries.map((entry) => (
                        <button
                          key={entry.address}
                          type="button"
                          className={`w-100 text-start bg-white rounded-4 p-3 border border-2 ${
                            selectedMarkee === entry.address
                              ? "border-primary"
                              : ""
                          }`}
                          onClick={() => {
                            setFlowError("");
                            setSelectedMarkee(entry.address);
                          }}
                        >
                          <Stack
                            direction="horizontal"
                            gap={2}
                            className="justify-content-between align-items-start"
                          >
                            <span
                              style={{
                                fontFamily: MONOSPACE_FONT,
                                fontSize: 13,
                                lineHeight: 1.5,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                                overflowWrap: "anywhere",
                              }}
                            >
                              {entry.message}
                            </span>
                            <Stack
                              direction="horizontal"
                              gap={1}
                              className="flex-shrink-0"
                            >
                              {entry.address === backer.backerMarkee && (
                                <span className="bg-secondary text-white fw-semi-bold rounded-pill px-2 fs-sm">
                                  Backing
                                </span>
                              )}
                              {entry.address === topEntry?.address && (
                                <span className="bg-primary text-white fw-semi-bold rounded-pill px-2 fs-sm">
                                  #1
                                </span>
                              )}
                            </Stack>
                          </Stack>
                          <Stack
                            direction="horizontal"
                            className="justify-content-between mt-1"
                          >
                            <span className="text-secondary fs-sm">
                              {entry.name
                                ? displayOwnerName(entry.name)
                                : truncateAddress(entry.owner)}
                            </span>
                            <span className="fs-sm fw-semi-bold">
                              {formatMonthlyRate(entry.rate)} ETH/mo
                            </span>
                          </Stack>
                        </button>
                      ))}
                    </Stack>
                    {rateSection}
                    {mode === "update" && (
                      <p className="fs-sm text-secondary mt-3 mb-0">
                        You currently stream{" "}
                        {formatMonthlyRate(backer.flowRateToBoard)} ETH/mo to
                        this message.{" "}
                        <Button
                          variant="link"
                          className="p-0 fs-sm align-baseline"
                          disabled={isPending}
                          onClick={() => handleAction(handleStopStream)}
                        >
                          Stop streaming
                        </Button>
                      </p>
                    )}
                    {backer.flowRateToBoard === 0n &&
                      backer.backerDeposit > 0n && (
                        <p className="fs-sm text-secondary mt-3 mb-0">
                          {formatEther(backer.backerDeposit)} ETHx of deposit is
                          no longer backing a stream.{" "}
                          <Button
                            variant="link"
                            className="p-0 fs-sm align-baseline"
                            disabled={isPending}
                            onClick={() => handleAction(handleWithdrawDeposit)}
                          >
                            Withdraw it
                          </Button>
                        </p>
                      )}
                    {mode === "move" && selectedEntry !== null && (
                      <p className="fs-sm text-secondary mt-3 mb-0">
                        Your current stream to another message will be closed
                        and redirected to this one.
                      </p>
                    )}
                    {errorAlert}
                    <Button
                      className="w-100 rounded-4 py-3 fw-semi-bold mt-4"
                      disabled={isBackDisabled}
                      onClick={() => handleAction(handleStream)}
                    >
                      {submitLabel(
                        mode === "update" ? "Update Rate" : "Start Streaming",
                      )}
                    </Button>
                  </>
                )}
              </Tab.Pane>
              <Tab.Pane eventKey="edit">
                {ownedEntries.length > 1 && (
                  <Form.Group className="mb-4">
                    <Form.Label className="fw-semi-bold">
                      Your message
                    </Form.Label>
                    <Form.Select
                      value={editMarkee ?? ""}
                      className="bg-white border border-2 border-dark rounded-4 py-2 px-3"
                      onChange={(e) => {
                        const entry = ownedEntries.find(
                          (owned) => owned.address === e.target.value,
                        );

                        if (entry) {
                          setEditMarkee(entry.address);
                          setEditText(entry.message);
                        }
                      }}
                    >
                      {ownedEntries.map((entry) => (
                        <option key={entry.address} value={entry.address}>
                          {entry.message}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                )}
                <Form.Group>
                  <Form.Label className="fw-semi-bold">New message</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={editText}
                    maxLength={board.maxMessageLength ?? undefined}
                    className="bg-white border border-2 border-dark rounded-4 py-2 px-3"
                    style={{ fontFamily: MONOSPACE_FONT, textAlign: "left" }}
                    onChange={(e) => setEditText(e.target.value)}
                  />
                  {board.maxMessageLength !== null && (
                    <div className="text-end text-secondary fs-sm mt-1">
                      {editText.length}/{board.maxMessageLength}
                    </div>
                  )}
                </Form.Group>
                {errorAlert}
                <Button
                  className="w-100 rounded-4 py-3 fw-semi-bold mt-4"
                  disabled={isEditDisabled}
                  onClick={() => handleAction(handleUpdateMessage)}
                >
                  {submitLabel("Update Message")}
                </Button>
              </Tab.Pane>
            </Tab.Content>
          </Tab.Container>
          <p className="text-center text-secondary fs-sm mt-4 mb-0">
            Streams are paid in ETHx and stop when your balance runs out. Manage
            your stream on the{" "}
            <a
              href={MARKEE_NETWORK_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Markee app
            </a>
            .
          </p>
        </>
      )}
    </Stack>
  );
}
