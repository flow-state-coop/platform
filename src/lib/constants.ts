import { Address } from "viem";

export const SECONDS_IN_MONTH = 2628000;
export const WALLET_CONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID!;
export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as Address;
export const PINATA_JWT_KEY = process.env.NEXT_PUBLIC_PINATA_JWT_KEY;
export const FLOW_STATE_RECEIVER = "0xb3f2b4a0b5f2f99e6b6bfc71d5e18a59b92d5606";
export const IPFS_GATEWAYS = [
  "https://gateway.pinata.cloud",
  "https://nftstorage.link",
  "https://storry.tv",
  "https://4everland.io",
  "https://cf-ipfs.com",
  "https://ipfs.runfission.com",
  "https://w3s.link",
  "https://dweb.link",
  "https://trustless-gateway.link",
];
