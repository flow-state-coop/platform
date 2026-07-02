"use client";

import { useEffect, useMemo, useState } from "react";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import CloseButton from "react-bootstrap/CloseButton";
import Form from "react-bootstrap/Form";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import Image from "react-bootstrap/Image";
import Nav from "react-bootstrap/Nav";
import Tab from "react-bootstrap/Tab";
import { Address, BaseError, formatEther, parseEther } from "viem";
import { base } from "wagmi/chains";
import {
  useAccount,
  useBalance,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { markeeAbi, markeeLeaderboardAbi } from "@/lib/abi/markee";
import { ZERO_ADDRESS } from "@/lib/constants";
import { truncateAddress } from "@/lib/utils";
import {
  FLOW_STATE_MARKEE_ADDRESS,
  FLOW_STATE_MARKEE_URL,
  MARKEE_NETWORK_URL,
  MIN_INCREMENT,
  MONOSPACE_FONT,
  displayOwnerName,
  flaggedKey,
} from "../lib/markee";

export type MarkeeTab = "buy" | "boost";

type MarkeeModalProps = {
  topMessage: string;
  topMessageOwner: string;
  takeTopSpotWei: bigint | null;
  activeTab: MarkeeTab;
  onSelectTab: (tab: MarkeeTab) => void;
  message: string;
  onMessageChange: (value: string) => void;
  buyerName: string;
  onBuyerNameChange: (value: string) => void;
  ethAmount: string;
  onEthAmountChange: (value: string) => void;
  boostAmount: string;
  onBoostAmountChange: (value: string) => void;
  selectedMarkee: Address | null;
  onSelectMarkee: (address: Address) => void;
  onConnectWallet: () => void;
  onClose: () => void;
  onTxSuccess: () => void;
};

const MAX_AMOUNT_DIGITS = 8;

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

function formatEthDisplay(wei: bigint) {
  return parseFloat(formatEther(wei)).toFixed(3);
}

function balanceToAmountInput(balance: bigint) {
  const [intPart, fracPart = ""] = formatEther(balance).split(".");
  const fracDigits = Math.max(0, MAX_AMOUNT_DIGITS - intPart.length);
  const frac = fracPart.slice(0, fracDigits).replace(/0+$/, "");

  return frac ? `${intPart}.${frac}` : intPart;
}

function AmountSection({
  title,
  amount,
  onAmountChange,
  presets,
  placeholder,
  isConnected,
  balance,
}: {
  title: string;
  amount: string;
  onAmountChange: (value: string) => void;
  presets: { label: string; value: string }[];
  placeholder: string;
  isConnected: boolean;
  balance: bigint;
}) {
  const amountWei = parseEthInput(amount);
  const exceedsBalance =
    isConnected && amountWei !== null && amountWei > balance;

  return (
    <Form.Group>
      <Form.Label className="fw-semi-bold">{title}</Form.Label>
      {presets.length > 0 && (
        <Stack direction="horizontal" gap={2} className="mb-2 flex-wrap">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="outline-primary"
              size="sm"
              className="rounded-4 fw-semi-bold"
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
        <Button
          variant="link"
          className="p-0 mt-1 fs-sm text-decoration-none"
          onClick={() => onAmountChange(balanceToAmountInput(balance))}
        >
          Balance: {parseFloat(formatEther(balance)).toFixed(4)} ETH
        </Button>
      )}
      {exceedsBalance && (
        <p className="text-danger fs-sm mb-0 mt-2">
          Amount exceeds your balance
        </p>
      )}
    </Form.Group>
  );
}

export default function MarkeeModal(props: MarkeeModalProps) {
  const {
    topMessage,
    topMessageOwner,
    takeTopSpotWei,
    activeTab,
    onSelectTab,
    message,
    onMessageChange,
    buyerName,
    onBuyerNameChange,
    ethAmount,
    onEthAmountChange,
    boostAmount,
    onBoostAmountChange,
    selectedMarkee,
    onSelectMarkee,
    onConnectWallet,
    onClose,
    onTxSuccess,
  } = props;

  const [flagged, setFlagged] = useState<Set<string>>(new Set());

  const { address, isConnected, chainId } = useAccount();
  const isOnBase = isConnected && chainId === base.id;
  const { switchChain } = useSwitchChain();
  const { data: balanceQuery } = useBalance({ address, chainId: base.id });
  const balance = balanceQuery?.value ?? 0n;

  const { data: configData } = useReadContracts({
    contracts: [
      {
        chainId: base.id,
        address: FLOW_STATE_MARKEE_ADDRESS,
        abi: markeeLeaderboardAbi,
        functionName: "minimumPrice",
      },
      {
        chainId: base.id,
        address: FLOW_STATE_MARKEE_ADDRESS,
        abi: markeeLeaderboardAbi,
        functionName: "maxMessageLength",
      },
    ],
  });
  const minimumPrice =
    configData?.[0]?.status === "success" ? configData[0].result : null;
  const maxMessageLength =
    configData?.[1]?.status === "success" ? Number(configData[1].result) : null;

  const {
    data: topMarkeesData,
    isError: isTopMarkeesError,
    isLoading: isTopMarkeesLoading,
  } = useReadContract({
    chainId: base.id,
    address: FLOW_STATE_MARKEE_ADDRESS,
    abi: markeeLeaderboardAbi,
    functionName: "getTopMarkees",
    args: [10n],
    query: { enabled: activeTab === "boost" },
  });

  const topMarkees = useMemo(() => {
    if (!topMarkeesData) {
      return [];
    }

    const [topAddresses, topFunds] = topMarkeesData;

    return topAddresses
      .map((markeeAddress, i) => ({
        address: markeeAddress,
        funds: topFunds[i] ?? 0n,
      }))
      .filter((entry) => entry.address !== ZERO_ADDRESS && entry.funds > 0n);
  }, [topMarkeesData]);

  const {
    data: markeeDetails,
    isError: isMarkeeDetailsError,
    isLoading: isMarkeeDetailsLoading,
  } = useReadContracts({
    contracts: topMarkees.flatMap((entry) => [
      {
        chainId: base.id,
        address: entry.address,
        abi: markeeAbi,
        functionName: "message",
      },
      {
        chainId: base.id,
        address: entry.address,
        abi: markeeAbi,
        functionName: "name",
      },
    ]),
    query: { enabled: topMarkees.length > 0 },
  });

  const topFundsOnChain = topMarkees.reduce(
    (max, entry) => (entry.funds > max ? entry.funds : max),
    0n,
  );
  const topMarkeeOnChain =
    topMarkees.find((entry) => entry.funds === topFundsOnChain)?.address ??
    null;

  const boostEntries = useMemo(
    () =>
      topMarkees
        .map((entry, i) => ({
          ...entry,
          message: (markeeDetails?.[i * 2]?.result as string | undefined) ?? "",
          name:
            (markeeDetails?.[i * 2 + 1]?.result as string | undefined) ?? "",
        }))
        .filter((entry) => !flagged.has(flaggedKey(entry.address))),
    [topMarkees, markeeDetails, flagged],
  );

  const selectedEntry =
    boostEntries.find((entry) => entry.address === selectedMarkee) ?? null;
  const isSelectedTop =
    selectedEntry !== null && selectedEntry.address === topMarkeeOnChain;
  const boostTakeTopSpotWei =
    selectedEntry !== null && !isSelectedTop
      ? topFundsOnChain - selectedEntry.funds + MIN_INCREMENT
      : null;

  const {
    writeContract,
    data: txHash,
    isPending: isAwaitingWallet,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: base.id,
  });

  useEffect(() => {
    if (isSuccess) {
      onTxSuccess();
    }
  }, [isSuccess, onTxSuccess]);

  useEffect(() => {
    fetch("/api/markee/moderation")
      .then((res) => res.json())
      .then((data) =>
        setFlagged(
          new Set(
            ((data.flagged ?? []) as string[]).map((entry) =>
              entry.toLowerCase(),
            ),
          ),
        ),
      )
      .catch(() => {});
  }, []);

  const buyAmountWei = parseEthInput(ethAmount);
  const boostAmountWei = parseEthInput(boostAmount);
  const isTxLoading = isAwaitingWallet || isConfirming;
  const isLowBalance =
    isConnected && minimumPrice !== null && balance < minimumPrice;

  const isBuyDisabled =
    isTxLoading ||
    (isOnBase &&
      (isLowBalance ||
        !message.trim() ||
        buyAmountWei === null ||
        buyAmountWei > balance ||
        (minimumPrice !== null && buyAmountWei < minimumPrice)));
  const isBoostDisabled =
    isTxLoading ||
    (isOnBase &&
      (selectedEntry === null ||
        boostAmountWei === null ||
        boostAmountWei === 0n ||
        boostAmountWei > balance));

  const isBoostListLoading =
    isTopMarkeesLoading || (topMarkees.length > 0 && isMarkeeDetailsLoading);

  const handleSelectTab = (key: string | null) => {
    if (key === "buy" || key === "boost") {
      resetWrite();
      onSelectTab(key);
    }
  };

  const handleBuy = () => {
    if (buyAmountWei === null) {
      return;
    }

    writeContract({
      chainId: base.id,
      address: FLOW_STATE_MARKEE_ADDRESS,
      abi: markeeLeaderboardAbi,
      functionName: "createMarkee",
      args: [message.trim(), buyerName.trim()],
      value: buyAmountWei,
    });
  };

  const handleBoost = () => {
    if (boostAmountWei === null || selectedEntry === null) {
      return;
    }

    writeContract({
      chainId: base.id,
      address: FLOW_STATE_MARKEE_ADDRESS,
      abi: markeeLeaderboardAbi,
      functionName: "addFunds",
      args: [selectedEntry.address],
      value: boostAmountWei,
    });
  };

  const errorAlert = writeError ? (
    <Alert variant="danger" className="rounded-4 fs-sm p-3 mt-3 mb-0">
      {writeError instanceof BaseError
        ? writeError.shortMessage
        : writeError.message}
    </Alert>
  ) : null;

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
      {isSuccess ? (
        <Stack
          direction="vertical"
          gap={3}
          className="align-items-center text-center py-5"
        >
          <Image src="/check-circle.svg" alt="" width={64} height={64} />
          <span className="fs-4 fw-semi-bold">Transaction confirmed!</span>
          <a
            href={`https://basescan.org/tx/${txHash}`}
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
          {topMessage && (
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
                {topMessage}
              </span>
              {topMessageOwner && (
                <span className="d-block text-secondary fs-sm mt-1">
                  — {displayOwnerName(topMessageOwner)}
                </span>
              )}
            </div>
          )}
          <Tab.Container activeKey={activeTab} onSelect={handleSelectTab}>
            <Nav className="gap-2 mb-4 border-0 flex-nowrap">
              {[
                { key: "buy", label: "Buy a Message" },
                { key: "boost", label: "Boost Existing Message" },
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
                    maxLength={maxMessageLength ?? undefined}
                    placeholder="Your message"
                    className="bg-white border border-2 border-dark rounded-4 py-2 px-3"
                    style={{ fontFamily: MONOSPACE_FONT, textAlign: "left" }}
                    onChange={(e) => onMessageChange(e.target.value)}
                  />
                  {maxMessageLength !== null && (
                    <div className="text-end text-secondary fs-sm mt-1">
                      {message.length}/{maxMessageLength}
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
                    placeholder="Shown with your message"
                    className="bg-white border border-2 border-dark rounded-4 py-2 px-3"
                    onChange={(e) => onBuyerNameChange(e.target.value)}
                  />
                </Form.Group>
                <AmountSection
                  title="ETH Amount"
                  amount={ethAmount}
                  onAmountChange={onEthAmountChange}
                  presets={[
                    ...(takeTopSpotWei !== null
                      ? [
                          {
                            label: `Take top spot (${formatEthDisplay(takeTopSpotWei)} ETH)`,
                            value: formatEther(takeTopSpotWei),
                          },
                        ]
                      : []),
                    ...(minimumPrice !== null
                      ? [
                          {
                            label: `Minimum (${formatEther(minimumPrice)} ETH)`,
                            value: formatEther(minimumPrice),
                          },
                        ]
                      : []),
                  ]}
                  placeholder={
                    minimumPrice !== null ? formatEther(minimumPrice) : "0.0"
                  }
                  isConnected={isConnected}
                  balance={balance}
                />
                {isLowBalance && minimumPrice !== null && (
                  <Alert
                    variant="warning"
                    className="rounded-4 fs-sm p-3 mt-3 mb-0"
                  >
                    Your ETH balance on Base is below the minimum price of{" "}
                    {formatEther(minimumPrice)} ETH.
                  </Alert>
                )}
                {errorAlert}
                <Button
                  className="w-100 rounded-4 py-3 fw-semi-bold mt-4"
                  disabled={isBuyDisabled}
                  onClick={() =>
                    !isConnected
                      ? onConnectWallet()
                      : !isOnBase
                        ? switchChain({ chainId: base.id })
                        : handleBuy()
                  }
                >
                  {isTxLoading ? <Spinner size="sm" /> : "Buy Message"}
                </Button>
              </Tab.Pane>
              <Tab.Pane eventKey="boost">
                {isTopMarkeesError || isMarkeeDetailsError ? (
                  <Alert variant="danger" className="rounded-4 fs-sm p-3">
                    Couldn&apos;t load the current messages. Please try again
                    later.
                  </Alert>
                ) : isBoostListLoading ? (
                  <div className="text-center py-5">
                    <Spinner />
                  </div>
                ) : boostEntries.length === 0 ? (
                  <p className="text-secondary py-3">No messages available.</p>
                ) : (
                  <>
                    <Stack
                      direction="vertical"
                      gap={2}
                      className="mb-3"
                      style={{ maxHeight: 280, overflowY: "auto" }}
                    >
                      {boostEntries.map((entry) => (
                        <button
                          key={entry.address}
                          type="button"
                          className={`w-100 text-start bg-white rounded-4 p-3 border border-2 ${
                            selectedMarkee === entry.address
                              ? "border-primary"
                              : ""
                          }`}
                          onClick={() => {
                            resetWrite();
                            onSelectMarkee(entry.address);
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
                            {entry.address === topMarkeeOnChain && (
                              <span className="bg-primary text-white fw-semi-bold rounded-pill px-2 fs-sm flex-shrink-0">
                                #1
                              </span>
                            )}
                          </Stack>
                          <Stack
                            direction="horizontal"
                            className="justify-content-between mt-1"
                          >
                            <span className="text-secondary fs-sm">
                              {entry.name
                                ? displayOwnerName(entry.name)
                                : truncateAddress(entry.address)}
                            </span>
                            <span className="fs-sm fw-semi-bold">
                              {formatEthDisplay(entry.funds)} ETH
                            </span>
                          </Stack>
                        </button>
                      ))}
                    </Stack>
                    <p className="fs-sm mb-4">
                      <a
                        href={FLOW_STATE_MARKEE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {boostEntries.length > 5
                          ? "See more messages and edit messages you own."
                          : "Edit messages you own on the Markee app."}
                      </a>
                    </p>
                    {isSelectedTop && (
                      <p className="fs-sm text-secondary mb-2">
                        This message has the top spot. Add more funds to make it
                        harder to reach.
                      </p>
                    )}
                    <AmountSection
                      title="Amount to Pay"
                      amount={boostAmount}
                      onAmountChange={onBoostAmountChange}
                      presets={
                        boostTakeTopSpotWei !== null
                          ? [
                              {
                                label: `Take top spot (${formatEthDisplay(boostTakeTopSpotWei)} ETH)`,
                                value: formatEther(boostTakeTopSpotWei),
                              },
                            ]
                          : []
                      }
                      placeholder="0.0"
                      isConnected={isConnected}
                      balance={balance}
                    />
                    {errorAlert}
                    <Button
                      className="w-100 rounded-4 py-3 fw-semi-bold mt-4"
                      disabled={isBoostDisabled}
                      onClick={() =>
                        !isConnected
                          ? onConnectWallet()
                          : !isOnBase
                            ? switchChain({ chainId: base.id })
                            : handleBoost()
                      }
                    >
                      {isTxLoading ? (
                        <Spinner size="sm" />
                      ) : (
                        "Add Funds to this Message"
                      )}
                    </Button>
                  </>
                )}
              </Tab.Pane>
            </Tab.Content>
          </Tab.Container>
          <p className="text-center text-secondary fs-sm mt-4 mb-0">
            You&apos;ll receive MARKEE tokens with your purchase and co-own the{" "}
            <a
              href={MARKEE_NETWORK_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Markee Network
            </a>
            .
          </p>
        </>
      )}
    </Stack>
  );
}
