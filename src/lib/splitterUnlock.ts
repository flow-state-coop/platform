import type { Address } from "viem";

// One payment per pool, forever. USDC only: an exact dollar amount with no
// oracle, no tolerance band, and no dispute about what was owed at the moment
// the transaction confirmed. Payments land on the bot address on the pool's own
// chain, so revenue accrues where the bot spends gas.
export const SPLITTER_UNLOCK_PRICE = 10_000_000n;
export const SPLITTER_UNLOCK_PRICE_LABEL = "10 USDC";

// Circle-issued native USDC, verified on-chain (symbol USDC, 6 decimals).
// A gated chain missing from this map cannot accept payment, so every write on
// it is refused: adding a network means deciding its pricing here, not getting
// a free API by omission.
export const SPLITTER_UNLOCK_USDC: Record<number, Address> = {
  10: "0x0b2C639c533813f4Aa9D7837CAF62653d097Ff85",
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  42220: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
};

// Testnets are free: there is no native USDC to pay with, and a gate on OP
// Sepolia would only stop integrators trying the API before paying for it.
const UNGATED_CHAIN_IDS = new Set([11155420]);

export function isSplitterUnlockRequired(chainId: number): boolean {
  return !UNGATED_CHAIN_IDS.has(chainId);
}

// Shared between the claim route and the unlock hook, which tells a refusal it
// can retry from one that means the stored transaction will never be a payment.
// Compared by identity on the client, so the wording can change freely as long
// as both sides import from here.
export const SPLITTER_LOCKED_ERROR =
  "This pool's API is locked. A pool admin can unlock it with a one-time payment of 10 USDC from the pool's admin page";

export const UNLOCK_TX_NOT_FOUND_ERROR =
  "Transaction not found. If it was just sent, wait for it to confirm and retry";

export const UNLOCK_TX_REVERTED_ERROR =
  "The payment transaction reverted, so nothing was paid";

export const UNLOCK_TX_NOT_PAYMENT_ERROR =
  "This transaction does not include a 10 USDC payment to the Flow State bot on this pool's network";

export const UNLOCK_TX_WRONG_SENDER_ERROR =
  "This transaction was not sent by your signed-in wallet. Sign in with the wallet that paid to unlock the pool";

export const UNLOCK_TX_USED_ERROR =
  "This transaction has already been used to unlock a different pool";
