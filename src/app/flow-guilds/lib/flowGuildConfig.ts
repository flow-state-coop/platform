import { Address } from "viem";

export type FlowGuildConfig = {
  id: string;
  name: string;
  description: string;
  logo: string;
  website: string;
  github: string;
  twitter: string;
  farcaster: string;
  telegram: string;
  discord: string;
  defaultChainId: number;
  defaultToken: string;
  safe: Address;
  flowSplitters: { [key: number]: { [key: string]: { id: string } } };
};

export const flowGuildConfigs: {
  [key: string]: FlowGuildConfig;
} = {
  ["core"]: {
    id: "core",
    name: "Flow State",
    description: `Flow State builds programmable money streaming tools for public goods and their builders.\n\nOpen a stream or send a one-time donation, so we can stay focused on creating impact. All streaming donations are eligible for [Superfluid SUP token rewards!](https://claim.superfluid.org/claim)`,
    logo: "/logo-circle.svg",
    website: "https://flowstate.network/flow-guilds/core",
    github: "https://github.com/flow-state-coop",
    twitter: "https://x.com/flowstatecoop",
    farcaster: "https://farcaster.xyz/flowstatecoop",
    telegram: "https://t.me/flowstatecoop",
    discord: "",
    defaultChainId: 8453,
    defaultToken: "ETHx",
    safe: "0x0d9d26375b882e0ddb38a781a40e80945e3d0b9b",
    flowSplitters: {
      8453: { ETHx: { id: "0x3" }, USDCx: { id: "0x10" } },
    },
  },
  ["greenpilldevguild"]: {
    id: "greenpilldevguild",
    name: "Green Pill Dev Guild",
    description:
      "We unite builders dedicated to regenerative innovation, creating Ethereum-based tools and resources that empower regen communities.",
    logo: "/greenpill.png",
    website:
      "https://app.charmverse.io/greenpill-dev-guild/home-089855607278293",
    github: "https://github.com/greenpill-dev-guild",
    twitter: "https://x.com/gp_dev_guild",
    farcaster: "https://farcaster.xyz/~/channel/greenpill-devs",
    telegram: "",
    discord: "https://discord.gg/ZJjft2EKz7",
    defaultChainId: 10,
    defaultToken: "USDGLOx",
    safe: "0xe09315a86ed0a39862158f5631b928145987fe05",
    flowSplitters: {
      10: { USDGLOx: { id: "0x5" } },
    },
  },
};
