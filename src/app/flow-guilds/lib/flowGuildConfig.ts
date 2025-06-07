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
    description: `Flow State builds programmable money streaming tools for public goods and their builders.\n\nOpen a stream or send a one-time donation, so we can stay focused on creating impact. All streaming donations are eligible for [Superfluid SUP token rewards](https://claim.superfluid.org/claim)!`,
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
    name: "Greenpill Dev Guild",
    description:
      "We unite builders dedicated to regenerative innovation, creating Ethereum-based tools and resources that empower regen communities.\n\nSupport our regenerative mission with a one-time donation or by opening a donation stream. All streaming supporters earn [Superfluid SUP token rewards](https://claim.superfluid.org/claim)!",
    logo: "/greenpill.png",
    website:
      "https://app.charmverse.io/greenpill-dev-guild/home-089855607278293",
    github: "https://github.com/greenpill-dev-guild",
    twitter: "https://x.com/gp_dev_guild",
    farcaster: "https://farcaster.xyz/~/channel/greenpill-devs",
    telegram: "",
    discord: "https://discord.gg/ZJjft2EKz7",
    defaultChainId: 10,
    defaultToken: "ETHx",
    safe: "0x49fa954b6c2cd14b4b3604ef1cc17ced20a9e42c",
    flowSplitters: {
      10: { ETHx: { id: "0x6" }, USDGLOx: { id: "0x5" } },
    },
  },
  ["guild-guild"]: {
    id: "guild-guild",
    name: "Guild Guild",
    description:
      "A locus of coordination for gathering and distributing the means of Guilding on Ethereum.\n\n1. Organize knowledge commons and distribute best practices\n2. Support builders of tools and organizers of guilds\n3. Network Guilds for further coordination cost savings\n\nAll streaming supporters earn [Superfluid SUP token rewards](https://claim.superfluid.org/claim).",
    logo: "/guild-guild.png",
    website: "https://guildguild.xyz/",
    github: "https://github.com/oovg/guildguildxyz",
    twitter: "https://x.com/guildguild_eth",
    farcaster: "",
    telegram: "",
    discord: "https://discord.gg/XbAqvWptsq",
    defaultChainId: 42161,
    defaultToken: "ETHx",
    safe: "0x29f4c46e04b9d35724af08f314d936f44f52527c",
    flowSplitters: {
      42161: { ETHx: { id: "0x2" } },
    },
  },
};
