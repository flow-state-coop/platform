import { describe, it, expect } from "vitest";
import {
  encodeEventTopics,
  erc20Abi,
  keccak256,
  numberToHex,
  toHex,
  type Address,
  type Log,
} from "viem";
import { findUnlockPayment } from "./unlockPayment";
import { SPLITTER_UNLOCK_PRICE } from "@/lib/splitterUnlock";

const USDC = "0x0b2C639c533813f4Aa9D7837CAF62653d097Ff85" as Address;
const RECEIVER = "0x7F0a04F131B8395e4e0bCf4c77E47845c952f49D" as Address;
const PAYER = "0x2222222222222222222222222222222222222222" as Address;
const OTHER = "0x4444444444444444444444444444444444444444" as Address;

function transferLog(
  token: Address,
  from: Address,
  to: Address,
  value: bigint,
) {
  return {
    address: token,
    topics: encodeEventTopics({
      abi: erc20Abi,
      eventName: "Transfer",
      args: { from, to },
    }),
    data: numberToHex(value, { size: 32 }),
  } as unknown as Log;
}

function receiptWith(logs: Log[]) {
  return { logs };
}

const expected = { token: USDC, receiver: RECEIVER };

describe("findUnlockPayment", () => {
  it("finds a transfer of exactly the price", () => {
    const payment = findUnlockPayment(
      receiptWith([transferLog(USDC, PAYER, RECEIVER, SPLITTER_UNLOCK_PRICE)]),
      expected,
    );

    expect(payment).toEqual({ payer: PAYER, amount: SPLITTER_UNLOCK_PRICE });
  });

  it("records an overpayment at what was actually paid", () => {
    const payment = findUnlockPayment(
      receiptWith([
        transferLog(USDC, PAYER, RECEIVER, SPLITTER_UNLOCK_PRICE * 2n),
      ]),
      expected,
    );

    expect(payment?.amount).toBe(SPLITTER_UNLOCK_PRICE * 2n);
  });

  it("sums a payment split across several transfers", () => {
    const payment = findUnlockPayment(
      receiptWith([
        transferLog(USDC, PAYER, RECEIVER, 6_000_000n),
        transferLog(USDC, PAYER, RECEIVER, 4_000_000n),
      ]),
      expected,
    );

    expect(payment).toEqual({ payer: PAYER, amount: SPLITTER_UNLOCK_PRICE });
  });

  it("refuses a transfer below the price", () => {
    expect(
      findUnlockPayment(
        receiptWith([
          transferLog(USDC, PAYER, RECEIVER, SPLITTER_UNLOCK_PRICE - 1n),
        ]),
        expected,
      ),
    ).toBeNull();
  });

  it("ignores the same amount in a different token", () => {
    expect(
      findUnlockPayment(
        receiptWith([
          transferLog(OTHER, PAYER, RECEIVER, SPLITTER_UNLOCK_PRICE),
        ]),
        expected,
      ),
    ).toBeNull();
  });

  it("ignores a transfer to a different receiver", () => {
    expect(
      findUnlockPayment(
        receiptWith([transferLog(USDC, PAYER, OTHER, SPLITTER_UNLOCK_PRICE)]),
        expected,
      ),
    ).toBeNull();
  });

  it("does not let transfers to others pad the total", () => {
    expect(
      findUnlockPayment(
        receiptWith([
          transferLog(USDC, PAYER, RECEIVER, 5_000_000n),
          transferLog(USDC, PAYER, OTHER, 5_000_000n),
        ]),
        expected,
      ),
    ).toBeNull();
  });

  it("returns null for an empty receipt", () => {
    expect(findUnlockPayment(receiptWith([]), expected)).toBeNull();
  });

  it("skips logs that are not ERC-20 transfers without throwing", () => {
    // An ERC-721 Transfer shares the signature but indexes the third argument,
    // leaving no data; an unrelated event does not even share the signature.
    const erc721Transfer = {
      address: USDC,
      topics: [
        keccak256(toHex("Transfer(address,address,uint256)")),
        numberToHex(BigInt(PAYER), { size: 32 }),
        numberToHex(BigInt(RECEIVER), { size: 32 }),
        numberToHex(1n, { size: 32 }),
      ],
      data: "0x",
    } as unknown as Log;
    const unrelated = {
      address: USDC,
      topics: [keccak256(toHex("Approval(address,address,uint256)"))],
      data: numberToHex(SPLITTER_UNLOCK_PRICE, { size: 32 }),
    } as unknown as Log;

    const payment = findUnlockPayment(
      receiptWith([
        erc721Transfer,
        unrelated,
        transferLog(USDC, PAYER, RECEIVER, SPLITTER_UNLOCK_PRICE),
      ]),
      expected,
    );

    expect(payment).toEqual({ payer: PAYER, amount: SPLITTER_UNLOCK_PRICE });
  });

  it("matches token and receiver case-insensitively", () => {
    const payment = findUnlockPayment(
      receiptWith([
        transferLog(
          USDC.toLowerCase() as Address,
          PAYER,
          RECEIVER.toLowerCase() as Address,
          SPLITTER_UNLOCK_PRICE,
        ),
      ]),
      expected,
    );

    expect(payment?.amount).toBe(SPLITTER_UNLOCK_PRICE);
  });
});
