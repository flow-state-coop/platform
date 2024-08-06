import { Network } from "@/types/network";

const networks: Network[] = [
  {
    id: 11155420,
    name: "OP Sepolia",
    icon: "/optimism.svg",
    rpcUrl: "https://optimism-sepolia-rpc.publicnode.com",
    blockExplorer: "https://sepolia-optimism.etherscan.io",
    superfluidConsole: "https://console.superfluid.finance/optimism-sepolia",
    superfluidDashboard: "https://app.superfluid.finance",
    superfluidSubgraph:
      "https://subgraph-endpoints.superfluid.dev/optimism-sepolia/protocol-v1",
    passportDecoder: "0xe53C60F8069C2f0c3a84F9B3DB5cf56f3100ba56",
    superfluidHost: "0xd399e2Fb5f4cf3722a11F65b88FAB6B2B8621005",
    superfluidResolver: "0x554c06487bEc8c890A0345eb05a5292C1b1017Bd",
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
    blockExplorer: "https://basescan.org/",
    rpcUrl: "https://mainnet.base.org/",
    superfluidConsole: "https://console.superfluid.finance/base-mainnet",
    superfluidDashboard: "https://app.superfluid.finance",
    superfluidSubgraph:
      "https://subgraph-endpoints.superfluid.dev/base-mainnet/protocol-v1",
    passportDecoder: "0x0000000000000000000000000000000000000000",
    superfluidHost: "0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74",
    superfluidResolver: "0x6a214c324553F96F04eFBDd66908685525Da0E0d",
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
  {
    id: 42161,
    name: "Arbitrum One",
    icon: "/arb.svg",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    blockExplorer: "https://arbiscan.io/",
    superfluidConsole: "https://console.superfluid.finance/arbitrum-one",
    superfluidDashboard: "https://app.superfluid.finance",
    superfluidSubgraph:
      "https://subgraph-endpoints.superfluid.dev/arbitrum-one/protocol-v1",
    passportDecoder: "0x2050256A91cbABD7C42465aA0d5325115C1dEB43",
    superfluidHost: "0xCf8Acb4eF033efF16E8080aed4c7D5B9285D2192",
    superfluidResolver: "0x609b9d9d6Ee9C3200745A79B9d3398DBd63d509F",
    recipientSuperappFactory: "0xbb6ecb12a045a84dc5e43fec0fcee53dfa11c878",
    allo: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
    alloRegistry: "0x4AAcca72145e1dF2aeC137E1f3C5E3D75DB8b5f3",
    gdaForwarder: "0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08",
    tokens: [
      {
        name: "ETHx",
        address: "0xe6c8d111337d0052b9d88bf5d7d55b7f8385acd3",
        icon: "/eth.svg",
      },
      {
        name: "UDSCx",
        address: "0xfc55f2854e74b4f42d01a6d3daac4c52d9dfdcff",
        icon: "/usdc.svg",
      },
    ],
  },
];

export { networks };
