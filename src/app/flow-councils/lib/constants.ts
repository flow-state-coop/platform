import { Chain } from "viem";
import { optimism, arbitrum, base, optimismSepolia, celo } from "viem/chains";

// Flow Council role constants
export const DEFAULT_ADMIN_ROLE: `0x${string}` =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
export const VOTER_MANAGER_ROLE: `0x${string}` =
  "0xe39c6677cd981766e3fe0ee03f87c2d365e15083059ced8f43405b909c968248";
export const RECIPIENT_MANAGER_ROLE: `0x${string}` =
  "0xe555445334ab5a223b26b938f3d289a9b846cb309abebf4aa790d6e1a6141c2e";

// Chain mapping for viem
export const chains: { [id: number]: Chain } = {
  10: optimism,
  42161: arbitrum,
  8453: base,
  11155420: optimismSepolia,
  42220: celo,
};
