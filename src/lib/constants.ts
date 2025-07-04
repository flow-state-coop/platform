import { Address } from "viem";

export const DEFAULT_CHAIN_ID = 8453;
export const DEFAULT_POOL_ID = "63";
export const SECONDS_IN_MONTH = 2628000;
export const MAX_FLOW_RATE = BigInt("0x7fffffffffffffffffffffff"); //  96bit signed int max
export const UINT256_MAX = BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
);
export const WALLET_CONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID!;
export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as Address;
export const PINATA_JWT_KEY = process.env.NEXT_PUBLIC_PINATA_JWT_KEY;
export const FLOW_STATE_RECEIVER = "0x0d9d26375b882e0ddb38a781a40e80945e3d0b9b";
export const SUPERVISUAL_BASE_URL = "https://graph.flowstate.network";
export const OG_DEFAULT_IMAGE_URL =
  "https://opengraph.b-cdn.net/production/images/46f99288-6ea8-4768-af0c-4b716bc1bf02.png?token=_GzabZBVzFhqh2_MDikORxOyaHHx9NygbVgatN7KFHY&height=630&width=1200&expires=33264419569";
export const IPFS_GATEWAYS = [
  "https://ipfs.fleek.co",
  "https://silver-definite-penguin-424.mypinata.cloud",
  "https://4everland.io",
  "https://gateway.pinata.cloud",
  "https://permaweb.eu.org",
  "https://ipfs.io",
  "https://nftstorage.link",
];
