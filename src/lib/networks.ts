import { Address } from "viem";

type Network = {
  id: number;
  name: string;
  icon: string;
  superfluidConsole: string;
  superfluidSubgraph: string;
  passportDecoder: Address;
  superfluidHost: Address;
  recipientSuperappFactory: Address;
  tokens: Token[];
  allo: Address;
  alloRegistry: Address;
  gdaForwarder: Address;
};

type Token = {
  name: string;
  address: Address;
  icon: string;
};

const networks: Network[] = [
  {
    id: 11155420,
    name: "OP Sepolia",
    icon: "/optimism.svg",
    superfluidConsole: "https://console.superfluid.finance/optimism-sepolia",
    superfluidSubgraph:
      "https://subgraph-endpoints.superfluid.dev/optimism-sepolia/protocol-v1",
    passportDecoder: "0xe53C60F8069C2f0c3a84F9B3DB5cf56f3100ba56",
    superfluidHost: "0xd399e2Fb5f4cf3722a11F65b88FAB6B2B8621005",
    recipientSuperappFactory: "0xdd023c9c2abf7f2adcedc8be7c688f82f06276de",
    allo: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
    alloRegistry: "0x4AAcca72145e1dF2aeC137E1f3C5E3D75DB8b5f3",
    gdaForwarder: "0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08",
    tokens: [
      {
        name: "ETHx",
        address: "0x0043d7c85C8b96a49A72A92C0B48CdC4720437d7",
        icon: "/eth.svg",
      },
      {
        name: "DAIx",
        address: "0xD6FAF98BeFA647403cc56bDB598690660D5257d2",
        icon: "/dai.svg",
      },
    ],
  },
  {
    id: 8453,
    name: "Base",
    icon: "/base.svg",
    superfluidConsole: "https://console.superfluid.finance/base-mainnet",
    superfluidSubgraph:
      "https://subgraph-endpoints.superfluid.dev/base-mainnet/protocol-v1",
    passportDecoder: "0x0000000000000000000000000000000000000000",
    superfluidHost: "0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74",
    recipientSuperappFactory: "0x0000000000000000000000000000000000000000",
    allo: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
    alloRegistry: "0x4AAcca72145e1dF2aeC137E1f3C5E3D75DB8b5f3",
    gdaForwarder: "0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08",
    tokens: [
      {
        name: "ETHx",
        address: "0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93",
        icon: "/eth.svg",
      },
    ],
  },
];

export { networks };
