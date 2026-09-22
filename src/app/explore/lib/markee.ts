import {
  Address,
  TransactionReceipt,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  keccak256,
  parseEventLogs,
  parseEther,
  toBytes,
} from "viem";
import { base } from "viem/chains";
import { cfaForwarderAbi, superTokenAbi } from "@sfpro/sdk/abi";
import { hostAbi, cfaAbi, gdaAbi } from "@sfpro/sdk/abi/core";
import { prepareOperation, OPERATION_TYPE } from "@sfpro/sdk/constant";
import { markeeLeaderboardAbi } from "@/lib/abi/markee";
import { SECONDS_IN_MONTH } from "@/lib/constants";
import { networks } from "@/lib/networks";
import { truncateAddress } from "@/lib/utils";
import { TransactionCall } from "@/types/transactionCall";

const baseNetwork = networks.find((network) => network.id === base.id)!;

export const FLOW_STATE_MARKEE_ADDRESS =
  "0x29f45f615f3104b31ce55fa7704b565fe411ce75" as const;
export const FLOW_STATE_MARKEE_URL = `https://markee.xyz/markee/${FLOW_STATE_MARKEE_ADDRESS}`;
export const MARKEE_NETWORK_URL = "https://markee.xyz";
export const MARKEE_WATERMARK_URL =
  "https://www.markee.xyz/markee-logo-dark.png";
// Called from the browser so the per-IP view dedupe sees each visitor
export const MARKEE_VIEWS_URL = "https://www.markee.xyz/api/views";
export const DEFAULT_TOP_MESSAGE =
  "Your message could be here. Stream to the Flow State Markee.";
export const MONOSPACE_FONT = "'Courier New', Courier, monospace";
export const MARKEE_CHAIN_ID = base.id;
export const SUPERFLUID_HOST = baseNetwork.superfluidHost;
export const CFA_FORWARDER = baseNetwork.cfaForwarder;
export const ETHX = baseNetwork.tokens.find(
  (token) => token.symbol === "ETHx",
)!.address;

export const CFA_AGREEMENT_ID = keccak256(
  toBytes("org.superfluid-finance.agreements.ConstantFlowAgreement.v1"),
);
export const GDA_AGREEMENT_ID = keccak256(
  toBytes("org.superfluid-finance.agreements.GeneralDistributionAgreement.v1"),
);

// StreamingLeaderboard.BUFFER_PERIOD, the board's refundable deposit per backer
export const BUFFER_PERIOD_SECONDS = 14400n;
export const RUNWAY_MONTHS = 3n;
export const GAS_RESERVE_WEI = parseEther("0.001");
const SECONDS_IN_MONTH_WEI = BigInt(SECONDS_IN_MONTH);
const MICRO_ETH = parseEther("0.000001");
const THOUSANDTH_ETH = parseEther("0.001");
const SECONDS_IN_DAY = 86400n;

export type MarkeeEntry = {
  address: Address;
  message: string;
  name: string;
  owner: Address;
  rate: bigint;
};

export function displayOwnerName(owner: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(owner) ? truncateAddress(owner) : owner;
}

export function flaggedKey(markeeAddress: string) {
  return `${MARKEE_CHAIN_ID}:${markeeAddress.toLowerCase()}`;
}

// Floor keeps a round monthly amount round when the board's minimum sits just
// under it; ceil otherwise, so the recovered monthly cost never undershoots.
export function monthlyToRatePerSec(
  weiPerMonth: bigint,
  minimumMonthlyRate: bigint,
) {
  const floorRate = weiPerMonth / SECONDS_IN_MONTH_WEI;

  if (floorRate * SECONDS_IN_MONTH_WEI >= minimumMonthlyRate) {
    return floorRate;
  }

  return (weiPerMonth + SECONDS_IN_MONTH_WEI - 1n) / SECONDS_IN_MONTH_WEI;
}

export function ratePerSecToMonthly(ratePerSec: bigint) {
  return ratePerSec * SECONDS_IN_MONTH_WEI;
}

export function bufferFor(ratePerSec: bigint) {
  return ratePerSec * BUFFER_PERIOD_SECONDS;
}

export function isBelowMinimumRate(
  ratePerSec: bigint,
  minimumMonthlyRate: bigint,
) {
  return ratePerSecToMonthly(ratePerSec) < minimumMonthlyRate;
}

export function ceilToThousandthEth(wei: bigint) {
  return ((wei + THOUSANDTH_ETH - 1n) / THOUSANDTH_ETH) * THOUSANDTH_ETH;
}

function ceilToMicroEth(wei: bigint) {
  return ((wei + MICRO_ETH - 1n) / MICRO_ETH) * MICRO_ETH;
}

function floorToMicroEth(wei: bigint) {
  return (wei / MICRO_ETH) * MICRO_ETH;
}

// Monthly amount whose floored per-second rate still clears the top rate
export function monthlyToOvertake(topRate: bigint, targetRate: bigint) {
  const shortfall = topRate > targetRate ? topRate - targetRate : 0n;

  return ceilToMicroEth(ratePerSecToMonthly(shortfall + 2n));
}

export function monthlyToWin(
  topRate: bigint,
  targetRate: bigint,
  minimumMonthlyRate: bigint,
) {
  const overtake = monthlyToOvertake(topRate, targetRate);
  const minimum = ceilToThousandthEth(minimumMonthlyRate);

  return overtake > minimum ? overtake : minimum;
}

export function maxMonthlyFor(spendableWei: bigint) {
  return floorToMicroEth(spendableWei / RUNWAY_MONTHS);
}

export function runwaySeconds(prefund: bigint, netOutflowRate: bigint) {
  return netOutflowRate > 0n ? prefund / netOutflowRate : null;
}

export function formatRunway(seconds: bigint | null) {
  if (seconds === null) {
    return "no runway limit";
  }

  const days = seconds / SECONDS_IN_DAY;

  if (days >= 1n) {
    return `~${days} day${days === 1n ? "" : "s"} at this rate`;
  }

  return `~${seconds / 3600n} hours at this rate`;
}

export function formatEthAmountInput(wei: bigint) {
  const fixed = parseFloat(formatEther(wei)).toFixed(6);

  return fixed.replace(/0+$/, "").replace(/\.$/, "");
}

export function formatMonthlyRate(ratePerSec: bigint) {
  return formatEthAmountInput(ceilToMicroEth(ratePerSecToMonthly(ratePerSec)));
}

export type StreamFunding = {
  buffer: bigint;
  depositTopUp: bigint;
  wrapValue: bigint;
  prefund: bigint;
  isInsufficient: boolean;
};

// The board pulls the deposit top-up from the backer's ETHx, and the CFA locks
// its own buffer from what is left, so the prefund has to clear the buffer.
export function computeStreamFunding({
  ratePerSec,
  ethxBalance,
  ethBalance,
  existingDeposit,
}: {
  ratePerSec: bigint;
  ethxBalance: bigint;
  ethBalance: bigint;
  existingDeposit: bigint;
}): StreamFunding {
  const buffer = bufferFor(ratePerSec);
  const depositTopUp = buffer > existingDeposit ? buffer - existingDeposit : 0n;
  const target =
    ratePerSecToMonthly(ratePerSec) * RUNWAY_MONTHS + depositTopUp + buffer;

  if (ratePerSec <= 0n) {
    return {
      buffer,
      depositTopUp,
      wrapValue: 0n,
      prefund: 0n,
      isInsufficient: false,
    };
  }

  if (ethxBalance >= target) {
    return {
      buffer,
      depositTopUp,
      wrapValue: 0n,
      prefund: ethxBalance - depositTopUp,
      isInsufficient: false,
    };
  }

  const affordable =
    ethBalance > GAS_RESERVE_WEI ? ethBalance - GAS_RESERVE_WEI : 0n;
  const shortfall = target - ethxBalance;
  const wrapValue = shortfall < affordable ? shortfall : affordable;
  const prefundRaw = ethxBalance + wrapValue - depositTopUp;
  const prefund = prefundRaw > 0n ? prefundRaw : 0n;

  return {
    buffer,
    depositTopUp,
    wrapValue,
    prefund,
    isInsufficient: prefund <= buffer,
  };
}

export type StreamMode = "open" | "update" | "move";

export type StreamParams = {
  mode: StreamMode;
  backer: Address;
  markee: Address;
  pool: Address;
  ratePerSec: bigint;
  depositTopUp: bigint;
  wrapValue: bigint;
  cfaAgreement: Address;
  gdaAgreement: Address;
};

function wrapOp(backer: Address) {
  return prepareOperation({
    operationType: OPERATION_TYPE.SIMPLE_FORWARD_CALL,
    target: ETHX,
    data: encodeFunctionData({
      abi: superTokenAbi,
      functionName: "upgradeByETHTo",
      args: [backer],
    }),
  });
}

function depositBufferOp(backer: Address, amount: bigint) {
  return prepareOperation({
    operationType: OPERATION_TYPE.SIMPLE_FORWARD_CALL,
    target: FLOW_STATE_MARKEE_ADDRESS,
    data: encodeFunctionData({
      abi: markeeLeaderboardAbi,
      functionName: "depositBuffer",
      args: [backer, amount],
    }),
  });
}

function createFlowOp(
  markee: Address,
  ratePerSec: bigint,
  cfaAgreement: Address,
) {
  return prepareOperation({
    operationType: OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT,
    target: cfaAgreement,
    data: encodeFunctionData({
      abi: cfaAbi,
      functionName: "createFlow",
      args: [ETHX, FLOW_STATE_MARKEE_ADDRESS, ratePerSec, "0x"],
    }),
    userData: encodeAbiParameters([{ type: "address" }], [markee]),
  });
}

function updateFlowOp(ratePerSec: bigint, cfaAgreement: Address) {
  return prepareOperation({
    operationType: OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT,
    target: cfaAgreement,
    data: encodeFunctionData({
      abi: cfaAbi,
      functionName: "updateFlow",
      args: [ETHX, FLOW_STATE_MARKEE_ADDRESS, ratePerSec, "0x"],
    }),
  });
}

function deleteFlowOp(backer: Address, cfaAgreement: Address) {
  return prepareOperation({
    operationType: OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT,
    target: cfaAgreement,
    data: encodeFunctionData({
      abi: cfaAbi,
      functionName: "deleteFlow",
      args: [ETHX, backer, FLOW_STATE_MARKEE_ADDRESS, "0x"],
    }),
  });
}

function connectPoolOp(pool: Address, gdaAgreement: Address) {
  return prepareOperation({
    operationType: OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT,
    target: gdaAgreement,
    data: encodeFunctionData({
      abi: gdaAbi,
      functionName: "connectPool",
      args: [pool, "0x"],
    }),
  });
}

// Wrap first so the host's ETH balance is spent before the value-0 forwards.
// updateFlow keeps the backer's current markee, so only open and move tag the
// flow with userData and connect the refund pool.
export function buildStreamOps(params: StreamParams) {
  const {
    mode,
    backer,
    markee,
    pool,
    ratePerSec,
    depositTopUp,
    wrapValue,
    cfaAgreement,
    gdaAgreement,
  } = params;
  const ops = [];

  if (wrapValue > 0n) {
    ops.push(wrapOp(backer));
  }

  if (depositTopUp > 0n) {
    ops.push(depositBufferOp(backer, depositTopUp));
  }

  if (mode === "update") {
    ops.push(updateFlowOp(ratePerSec, cfaAgreement));

    return ops;
  }

  if (mode === "move") {
    ops.push(deleteFlowOp(backer, cfaAgreement));
  }

  ops.push(createFlowOp(markee, ratePerSec, cfaAgreement));
  ops.push(connectPoolOp(pool, gdaAgreement));

  return ops;
}

export function buildStreamCalls(
  params: StreamParams & { allowance: bigint },
): TransactionCall[] {
  const calls: TransactionCall[] = [];

  if (params.depositTopUp > 0n && params.allowance < params.depositTopUp) {
    calls.push({
      to: ETHX,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [FLOW_STATE_MARKEE_ADDRESS, params.depositTopUp],
      }),
    });
  }

  calls.push({
    to: SUPERFLUID_HOST,
    data: encodeFunctionData({
      abi: hostAbi,
      functionName: "batchCall",
      args: [buildStreamOps(params)],
    }),
    ...(params.wrapValue > 0n ? { value: params.wrapValue } : {}),
  });

  return calls;
}

export function buildCreateMarkeeCall(
  message: string,
  name: string,
): TransactionCall {
  return {
    to: FLOW_STATE_MARKEE_ADDRESS,
    data: encodeFunctionData({
      abi: markeeLeaderboardAbi,
      functionName: "createMarkee",
      args: [message, name],
    }),
  };
}

export function buildUpdateMessageCall(
  markee: Address,
  message: string,
): TransactionCall {
  return {
    to: FLOW_STATE_MARKEE_ADDRESS,
    data: encodeFunctionData({
      abi: markeeLeaderboardAbi,
      functionName: "updateMessage",
      args: [markee, message],
    }),
  };
}

export function buildStopStreamCall(): TransactionCall {
  return {
    to: CFA_FORWARDER,
    data: encodeFunctionData({
      abi: cfaForwarderAbi,
      functionName: "setFlowrate",
      args: [ETHX, FLOW_STATE_MARKEE_ADDRESS, 0n],
    }),
  };
}

export function buildWithdrawDepositCall(): TransactionCall {
  return {
    to: FLOW_STATE_MARKEE_ADDRESS,
    data: encodeFunctionData({
      abi: markeeLeaderboardAbi,
      functionName: "withdrawDeposit",
    }),
  };
}

export function parseCreatedMarkee(receipts: TransactionReceipt[]) {
  const logs = parseEventLogs({
    abi: markeeLeaderboardAbi,
    eventName: "MarkeeCreated",
    logs: receipts.flatMap((receipt) => receipt.logs),
  });
  const created = logs.find(
    (log) =>
      log.address.toLowerCase() === FLOW_STATE_MARKEE_ADDRESS.toLowerCase(),
  );

  return created?.args.markeeAddress ?? null;
}
