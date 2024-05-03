import { Address } from "viem";

export const WALLET_CONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID!;
export const ALLO_REGISTRY_ADDRESS = process.env
  .NEXT_PUBLIC_ALLO_REGISTRY_ADDRESS as Address;
