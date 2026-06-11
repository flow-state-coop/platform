export const DEFAULT_ADMIN_ROLE: `0x${string}` =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
export const VOTER_MANAGER_ROLE: `0x${string}` =
  "0xe39c6677cd981766e3fe0ee03f87c2d365e15083059ced8f43405b909c968248";
export const RECIPIENT_MANAGER_ROLE: `0x${string}` =
  "0xe555445334ab5a223b26b938f3d289a9b846cb309abebf4aa790d6e1a6141c2e";

// Celo mainnet chain ID — GoodDollar eligibility is Celo-only.
export const CELO_CHAIN_ID = 42220;

export const GOODBUILDERS_COUNCIL_ADDRESSES: `0x${string}`[] = [
  "0x714d013c073d6276b47f475549dae4559d898a77",
  "0xfabef1abae4998146e8a8422813eb787caa26ec2",
];

export const GOODDOLLAR_IDENTITY_ADDRESS: `0x${string}` =
  "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42";

// Flow State bot that holds VOTER_MANAGER_ROLE to add GoodDollar-verified
// voters. The grant UI gives the role to this address; the bot then signs
// addVoter calls with FLOW_STATE_ELIGIBILITY_PK, so this must stay equal to the
// address derived from that key.
export const FLOW_STATE_BOT_ADDRESS: `0x${string}` =
  "0x7F0a04F131B8395e4e0bCf4c77E47845c952f49D";

export const KNOWN_ADDRESS_NAMES: Record<string, string> = {
  [FLOW_STATE_BOT_ADDRESS.toLowerCase()]: "F(S) Automation Bot",
};

export const GOODBUILDERS_S2_POOL_ADDRESS: `0x${string}` =
  "0xafcab1ab378354b8ce0dbd0ae2e2c0dea01dcf0b";

export const GOODBUILDERS_S2_FEE_ADDRESS: `0x${string}` =
  "0x0d9d26375b882e0ddb38a781a40e80945e3d0b9b";

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];

export const ALLOWED_REACTIONS = [
  "\u{1F44D}",
  "\u{2764}\u{FE0F}",
  "\u{1F389}",
  "\u{1F64C}",
  "\u{1F30A}",
  "\u{1F9AB}",
] as const;
