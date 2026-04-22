import { Address } from "viem";

export const DEFAULT_CHAIN_ID = 8453;
export const DEFAULT_POOL_ID = "63";
export const SECONDS_IN_MONTH = 2628000;
export const SUPERFLUID_CALL_AGREEMENT_OPERATION = 201;
export const MAX_FLOW_RATE = BigInt("0x7fffffffffffffffffffffff"); //  96bit signed int max
export const UINT256_MAX = BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
);
export const WALLET_CONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID!;
export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as Address;
export const SUPERVISUAL_BASE_URL = "https://graph.flowstate.network";
export const OG_DEFAULT_IMAGE_URL = "https://flowstate.network/og_v2.png";
// Consumed only by useEnsResolution, which reads [0] for ENS avatar CIDs.
export const IPFS_GATEWAYS = ["https://ipfs.fleek.co"];
