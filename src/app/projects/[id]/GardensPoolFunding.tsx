"use client";

import { formatEther } from "viem";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Image from "react-bootstrap/Image";
import Dropdown from "react-bootstrap/Dropdown";
import NextImage from "next/image";
import { Network } from "@/types/network";
import { parseGardensPoolUrl } from "@/lib/gardensPool";
import { formatNumber } from "@/lib/utils";
import useStreamFunding from "./useStreamFunding";

type GardensPoolFundingProps = {
  gardensPoolUrl: string;
  network: Network;
};

export default function GardensPoolFunding({
  gardensPoolUrl,
  network,
}: GardensPoolFundingProps) {
  const parsed = parseGardensPoolUrl(gardensPoolUrl);
  const poolAddress = parsed?.poolAddress ?? "";

  const stream = useStreamFunding(network, poolAddress);

  return (
    <Card
      className="border-0 overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(var(--bs-primary-rgb), 0.04), rgba(var(--bs-primary-rgb), 0.01))",
        boxShadow:
          "0 0 0 1px rgba(var(--bs-primary-rgb), 0.15), 0 4px 24px rgba(0,0,0,0.06)",
      }}
    >
      <Card.Body className="p-5">
        <Stack
          direction="horizontal"
          gap={2}
          className="mb-5 align-items-center"
        >
          <Image src="/gardens.svg" alt="" width={24} height={24} />
          <span className="fw-bold fs-lg">Fund Gardens Pool</span>
        </Stack>

        <Stack direction="vertical" gap={3}>
          <FlowRateMetrics stream={stream} />
          <Stack
            direction="horizontal"
            gap={2}
            className="align-items-center rounded-3 px-3 py-2 bg-light"
          >
            <Image
              src={network.icon}
              alt=""
              width={20}
              height={20}
              className="rounded-circle"
            />
            <span style={{ fontSize: "0.85rem" }}>{network.name}</span>
          </Stack>
          <TokenDropdown
            tokens={network.tokens}
            selected={stream.selectedToken}
            onSelect={(token) => {
              stream.setSelectedToken(token);
              stream.setWrapAmount("");
            }}
          />
          <StreamInputs stream={stream} network={network} />
        </Stack>
      </Card.Body>
    </Card>
  );
}

const metricLabelStyle = {
  fontSize: "0.65rem",
  letterSpacing: "0.05em",
  opacity: 0.5,
};

function FlowRateMetrics({
  stream,
}: {
  stream: ReturnType<typeof useStreamFunding>;
}) {
  return (
    <Stack direction="horizontal" gap={4}>
      <RateMetric
        label="Total rate"
        value={stream.totalReceiverMonthlyRate}
        symbol={stream.selectedToken.symbol}
      />
      <RateMetric
        label="Your rate"
        value={stream.userMonthlyRate}
        symbol={stream.selectedToken.symbol}
      />
    </Stack>
  );
}

function RateMetric({
  label,
  value,
  symbol,
}: {
  label: string;
  value: string | null;
  symbol: string;
}) {
  return (
    <Stack direction="vertical" className="flex-fill">
      <span className="text-uppercase fw-bold" style={metricLabelStyle}>
        {label}
      </span>
      {value === null ? (
        <span className="placeholder-wave">
          <span
            className="placeholder bg-light rounded-2"
            style={{ width: "5rem", height: "1.2rem", display: "inline-block" }}
          />
        </span>
      ) : (
        <span className="fw-bold">
          {formatNumber(Number(value))}{" "}
          <span className="text-muted fw-normal" style={{ fontSize: "0.8rem" }}>
            {symbol}/mo
          </span>
        </span>
      )}
    </Stack>
  );
}

function TokenDropdown({
  tokens,
  selected,
  onSelect,
}: {
  tokens: Network["tokens"];
  selected: Network["tokens"][number];
  onSelect: (token: Network["tokens"][number]) => void;
}) {
  return (
    <Dropdown>
      <Dropdown.Toggle
        variant="outline-secondary"
        className="w-100 d-flex align-items-center justify-content-between rounded-3"
      >
        <Stack direction="horizontal" gap={2} className="align-items-center">
          <Image
            src={selected.icon}
            alt=""
            width={20}
            height={20}
            className="rounded-circle"
          />
          {selected.symbol}
        </Stack>
      </Dropdown.Toggle>
      <Dropdown.Menu className="w-100">
        {tokens.map((token) => (
          <Dropdown.Item
            key={token.address}
            active={token.address === selected.address}
            onClick={() => onSelect(token)}
          >
            <Stack
              direction="horizontal"
              gap={2}
              className="align-items-center"
            >
              <Image
                src={token.icon}
                alt=""
                width={20}
                height={20}
                className="rounded-circle"
              />
              {token.symbol}
            </Stack>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}

function StreamInputs({
  stream,
  network,
}: {
  stream: ReturnType<typeof useStreamFunding>;
  network: Network;
}) {
  return (
    <>
      <Form.Group>
        <Form.Label className="fw-bold" style={{ fontSize: "0.75rem" }}>
          Monthly stream rate
        </Form.Label>
        <Form.Control
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={stream.monthlyAmount}
          onChange={(e) => stream.handleMonthlyAmountChange(e.target.value)}
          className="rounded-3"
        />
      </Form.Group>

      {!stream.isSuperTokenPure && (
        <Form.Group>
          <Form.Label className="fw-bold" style={{ fontSize: "0.75rem" }}>
            Wrap amount (
            {stream.isSuperTokenNative ? "ETH" : "underlying token"})
          </Form.Label>
          <Form.Control
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={stream.wrapAmount}
            onChange={(e) =>
              stream.setWrapAmount(e.target.value.replace(/[^0-9.,]/g, ""))
            }
            className="rounded-3"
          />
          {stream.underlyingTokenBalance && (
            <Form.Text>
              Available: {stream.underlyingTokenBalance.formatted}{" "}
              {stream.underlyingTokenBalance.symbol}
            </Form.Text>
          )}
        </Form.Group>
      )}

      <Stack
        direction="horizontal"
        className="justify-content-between align-items-center rounded-3 px-3 py-2"
        style={{ background: "rgba(var(--bs-primary-rgb), 0.06)" }}
      >
        <span style={{ fontSize: "0.8rem" }}>
          {stream.selectedToken.symbol} balance
        </span>
        {stream.userMonthlyRate === null ? (
          <span className="placeholder-wave">
            <span
              className="placeholder bg-light rounded-2"
              style={{
                width: "5rem",
                height: "1.1rem",
                display: "inline-block",
              }}
            />
          </span>
        ) : (
          <Stack direction="horizontal" gap={1} className="align-items-center">
            <span className="fw-bold" style={{ fontSize: "0.85rem" }}>
              {formatNumber(Number(formatEther(stream.superTokenBalance)))}
            </span>
            {stream.userNetMonthlyFlow && (
              <span
                className={
                  stream.userNetMonthlyFlow.isPositive
                    ? "text-success"
                    : "text-danger"
                }
                style={{ fontSize: "0.75rem" }}
              >
                {stream.userNetMonthlyFlow.isPositive ? "+" : "-"}
                {stream.userNetMonthlyFlow.value}/mo
              </span>
            )}
          </Stack>
        )}
      </Stack>

      {stream.transactionError && (
        <div className="text-danger" style={{ fontSize: "0.85rem" }}>
          {stream.transactionError}
        </div>
      )}
      {!stream.isCorrectChain ? (
        <Button
          variant="primary"
          className="w-100 rounded-3 fw-bold"
          onClick={() => stream.switchChain({ chainId: network.id })}
        >
          Switch to {network.name}
        </Button>
      ) : (
        <Stack direction="vertical" className="align-items-center">
          <Button
            variant={stream.isSuccess ? "success" : "primary"}
            className="w-100 rounded-3 fw-bold"
            disabled={!stream.canExecute && !stream.isSuccess}
            style={{ pointerEvents: stream.isSuccess ? "none" : "auto" }}
            onClick={stream.handleExecute}
          >
            {stream.areTransactionsLoading ? (
              <Stack
                direction="horizontal"
                gap={2}
                className="justify-content-center"
              >
                <Spinner size="sm" />
                {stream.transactionCount > 1 && (
                  <span>
                    {stream.completedTransactions + 1}/{stream.transactionCount}
                  </span>
                )}
              </Stack>
            ) : stream.isSuccess ? (
              <NextImage
                src="/success.svg"
                alt="Success"
                width={20}
                height={20}
                style={{
                  filter:
                    "brightness(0) saturate(100%) invert(85%) sepia(8%) saturate(138%) hue-rotate(138deg) brightness(93%) contrast(106%)",
                }}
              />
            ) : stream.hasExistingFlow ? (
              "Update Stream"
            ) : (
              "Start Stream"
            )}
          </Button>
          {stream.hasExistingFlow && !stream.isSuccess && (
            <Button
              variant="transparent"
              className="text-primary text-decoration-underline border-0 pb-0 fw-semi-bold"
              style={{
                pointerEvents: stream.areTransactionsLoading ? "none" : "auto",
              }}
              onClick={stream.handleCancel}
            >
              Cancel stream
            </Button>
          )}
        </Stack>
      )}
    </>
  );
}

export { FlowRateMetrics, TokenDropdown, StreamInputs };
