import { Network } from "@/types/network";

const networks: Network[] = [
  {
    id: 42161,
    name: "Arbitrum One",
    label: "arbitrum-one",
    icon: "/arb.png",
    rpcUrl: "https://arbitrum.meowrpc.com",
    blockExplorer: "https://arbiscan.io/",
    superfluidExplorer: "https://explorer.superfluid.finance/arbitrum-one",
    superfluidDashboard: "https://app.superfluid.finance",
    superfluidSubgraph:
      "https://subgraph-endpoints.superfluid.dev/arbitrum-one/protocol-v1",
    onRampLabel: "arbitrum",
    flowSplitter: "0xCbA99f104D17D06Ce4C80Be143f29b6fd44D3Ce9",
    flowSplitterSubgraph:
      "https://api.subgraph.ormilabs.com/api/public/f73714f1-9afa-4cd8-99bb-d4c0522c9d2b/subgraphs/flow-splitter-arbitrum-one/0.0.3/gn",
    flowCouncilFactory: "0xe6a6E24905e200F69b57cE3B01D5F65776a40DF3",
    flowCouncilSubgraph:
      "https://api.subgraph.ormilabs.com/api/public/f73714f1-9afa-4cd8-99bb-d4c0522c9d2b/subgraphs/flow-council-arbitrum-one/v0.2.3/gn",
    flowStateEligibilityNft: "0x6Ee1Cc715EAB6a1a661d34C1439Fc7f05Aa5f435",
    flowStateEligibilityMinScore: 15,
    superfluidHost: "0xCf8Acb4eF033efF16E8080aed4c7D5B9285D2192",
    superfluidResolver: "0x609b9d9d6Ee9C3200745A79B9d3398DBd63d509F",
    recipientSuperappFactory: "0x7C959499F285E8Ca70EfDC46afD15C36A58c087a",
    allo: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
    alloRegistry: "0x4AAcca72145e1dF2aeC137E1f3C5E3D75DB8b5f3",
    gdaForwarder: "0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08",
    cfaForwarder: "0xcfA132E353cB4E398080B9700609bb008eceB125",
    tokens: [
      {
        symbol: "ETHx",
        address: "0xe6c8d111337d0052b9d88bf5d7d55b7f8385acd3",
        icon: "/eth.png",
      },
      {
        symbol: "ARBx",
        address: "0xB3EDb2F90fEc1Bf1F872a9ef143cfd614773Ad04",
        icon: "/arb.png",
      },
      {
        symbol: "DAIx",
        address: "0x521677A61D101A80cE0fB903b13cb485232774ee",
        icon: "/dai.png",
      },
      {
        symbol: "USDCx",
        address: "0xfc55f2854e74b4f42d01a6d3daac4c52d9dfdcff",
        icon: "/usdc.png",
      },
    ],
  },
  {
    id: 8453,
    name: "Base",
    label: "base",
    icon: "/base.svg",
    blockExplorer: "https://basescan.org",
    rpcUrl: "https://base-rpc.publicnode.com",
    superfluidExplorer: "https://explorer.superfluid.finance/base-mainnet",
    superfluidDashboard: "https://app.superfluid.finance",
    superfluidSubgraph:
      "https://subgraph-endpoints.superfluid.dev/base-mainnet/protocol-v1",
    onRampLabel: "base",
    flowSplitter: "0x25B64C200cf3362BaC6961353D38A1dbEB42e60E",
    flowSplitterSubgraph:
      "https://api.subgraph.ormilabs.com/api/public/f73714f1-9afa-4cd8-99bb-d4c0522c9d2b/subgraphs/flow-splitter-base/v0.0.2/gn",
    flowCouncilFactory: "0x73DD388BC769eD4975Cb4e6Cfd9a5b9474082875",
    flowCouncilSubgraph:
      "https://api.subgraph.ormilabs.com/api/public/f73714f1-9afa-4cd8-99bb-d4c0522c9d2b/subgraphs/flow-council-base/v0.2.3/gn",
    flowStateEligibilityNft: "0xA72c184738842626a920A8935092b7b3f35A3082",
    flowStateEligibilityMinScore: 15,
    superfluidHost: "0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74",
    superfluidResolver: "0x6a214c324553F96F04eFBDd66908685525Da0E0d",
    recipientSuperappFactory: "0xf29933097dFC1456e8B3d934d89D90e6bbED76e5",
    allo: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
    alloRegistry: "0x4AAcca72145e1dF2aeC137E1f3C5E3D75DB8b5f3",
    gdaForwarder: "0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08",
    cfaForwarder: "0xcfA132E353cB4E398080B9700609bb008eceB125",
    tokens: [
      {
        symbol: "DAIx",
        address: "0x708169c8C87563Ce904E0a7F3BFC1F3b0b767f41",
        icon: "/dai.png",
      },
      {
        symbol: "DEGENx",
        address: "0x1efF3Dd78F4A14aBfa9Fa66579bD3Ce9E1B30529",
        icon: "/degen.png",
      },
      {
        symbol: "ETHx",
        address: "0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93",
        icon: "/eth.png",
      },
      {
        symbol: "HIGHERx",
        address: "0x5f2Fab273F1F64b6bc6ab8F35314CD21501F35C5",
        icon: "/higher.png",
      },
      {
        symbol: "USDCx",
        address: "0xD04383398dD2426297da660F9CCA3d439AF9ce1b",
        icon: "/usdc.png",
      },
    ],
  },
  {
    id: 42220,
    name: "Celo",
    label: "celo",
    icon: "/celo.svg",
    blockExplorer: "https://celoscan.io",
    rpcUrl: "https://celo.drpc.org",
    superfluidExplorer: "https://explorer.superfluid.finance/celo",
    superfluidDashboard: "https://app.superfluid.finance",
    superfluidSubgraph:
      "https://subgraph-endpoints.superfluid.dev/celo-mainnet/protocol-v1",
    onRampLabel: "celo",
    flowSplitter: "0x0e9ddfd2ffdb0ba1ac3340d865193a7b6d4ea147",
    flowSplitterSubgraph:
      "https://subgraph.satsuma-prod.com/9117a94551fa/flow-state/flow-splitter-celo/api",
    flowCouncilFactory: "0x25B64C200cf3362BaC6961353D38A1dbEB42e60E",
    flowCouncilSubgraph:
      "https://subgraph.satsuma-prod.com/9117a94551fa/flow-state/flow-council-celo/api",
    flowStateEligibilityNft: "",
    flowStateEligibilityMinScore: 15,
    superfluidHost: "0xA4Ff07cF81C02CFD356184879D953970cA957585",
    superfluidResolver: "0x05eE721BD4D803d6d477Aa7607395452B65373FF",
    recipientSuperappFactory: "0x30093246dE28629d3840e0493c12bc5EE0041103",
    allo: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
    alloRegistry: "0x4AAcca72145e1dF2aeC137E1f3C5E3D75DB8b5f3",
    gdaForwarder: "0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08",
    cfaForwarder: "0xcfA132E353cB4E398080B9700609bb008eceB125",
    tokens: [
      {
        symbol: "CELOx",
        address: "0x671425Ae1f272Bc6F79beC3ed5C4b00e9c628240",
        icon: "/celo.svg",
      },
      {
        symbol: "G$",
        address: "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A",
        icon: "/good-dollar.png",
      },
    ],
  },
  {
    id: 10,
    name: "Optimism",
    label: "optimism",
    icon: "/optimism.svg",
    rpcUrl: "https://optimism-rpc.publicnode.com",
    blockExplorer: "https://optimistic.etherscan.io",
    superfluidExplorer: "https://explorer.superfluid.finance/optimism-mainnet",
    superfluidDashboard: "https://app.superfluid.finance",
    superfluidSubgraph:
      "https://subgraph-endpoints.superfluid.dev/optimism-mainnet/protocol-v1",
    onRampLabel: "optimism",
    flowSplitter: "0x25B64C200cf3362BaC6961353D38A1dbEB42e60E",
    flowSplitterSubgraph:
      "https://api.subgraph.ormilabs.com/api/public/f73714f1-9afa-4cd8-99bb-d4c0522c9d2b/subgraphs/flow-splitter-optimism/v0.0.2/gn",
    flowCouncilFactory: "0xeba33Eb3B2aa36EC81390b4e10b4f61b555f194b",
    flowCouncilSubgraph:
      "https://api.subgraph.ormilabs.com/api/public/f73714f1-9afa-4cd8-99bb-d4c0522c9d2b/subgraphs/flow-council-optimism/v0.2.3/gn",
    flowStateEligibilityNft: "0x09A62710a3BFC83aae2956F1D5B2363e4773Db7a",
    flowStateEligibilityMinScore: 15,
    superfluidHost: "0x567c4B141ED61923967cA25Ef4906C8781069a10",
    superfluidResolver: "0x743B5f46BC86caF41bE4956d9275721E0531B186",
    recipientSuperappFactory: "0xC0d7774AbdFBD9a30BcC1b53E1A6D90d5804d934",
    allo: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
    alloRegistry: "0x4AAcca72145e1dF2aeC137E1f3C5E3D75DB8b5f3",
    gdaForwarder: "0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08",
    cfaForwarder: "0xcfA132E353cB4E398080B9700609bb008eceB125",
    tokens: [
      {
        symbol: "DAIx",
        address: "0x7d342726B69C28D942ad8BfE6Ac81b972349d524",
        icon: "/dai.png",
      },
      {
        symbol: "ETHx",
        address: "0x4ac8bD1bDaE47beeF2D1c6Aa62229509b962Aa0d",
        icon: "/eth.png",
      },
      {
        symbol: "OPx",
        address: "0x1828Bff08BD244F7990edDCd9B19cc654b33cDB4",
        icon: "/optimism.svg",
      },
      {
        symbol: "USDC.ex",
        address: "0x8430F084B939208E2eDEd1584889C9A66B90562f",
        icon: "/usdc.png",
      },
      {
        symbol: "USDGLOx",
        address: "0x9F41d0AA24E599fd8D0c180Ee3C0F609dc41c622",
        icon: "/usdglo.png",
      },
    ],
  },
  {
    id: 11155420,
    name: "OP Sepolia",
    label: "optimism-sepolia",
    icon: "/optimism.svg",
    rpcUrl: "https://optimism-sepolia-rpc.publicnode.com",
    blockExplorer: "https://sepolia-optimism.etherscan.io",
    superfluidExplorer: "https://explorer.superfluid.finance/optimism-sepolia",
    superfluidDashboard: "https://app.superfluid.finance",
    superfluidSubgraph:
      "https://subgraph-endpoints.superfluid.dev/optimism-sepolia/protocol-v1",
    onRampLabel: "optimism",
    flowSplitter: "0xd53B8Bed28E122eA20dCC90d3991a614EC163a21",
    flowSplitterSubgraph:
      "https://api.subgraph.ormilabs.com/api/public/f73714f1-9afa-4cd8-99bb-d4c0522c9d2b/subgraphs/flow-splitter-optimism-sepolia/v0.0.2/gn",
    flowCouncilFactory: "0x0037c884f51714fEA8194E3C0c547894736bF8F2",
    flowCouncilSubgraph:
      "https://api.subgraph.ormilabs.com/api/public/f73714f1-9afa-4cd8-99bb-d4c0522c9d2b/subgraphs/flow-council-optimism-sepolia/v0.2.3/gn",
    flowStateEligibilityNft: "0x1059A20C7aA0B4576B631d064730dB2E02940535",
    flowStateEligibilityMinScore: 0.5,
    superfluidHost: "0xd399e2Fb5f4cf3722a11F65b88FAB6B2B8621005",
    superfluidResolver: "0x554c06487bEc8c890A0345eb05a5292C1b1017Bd",
    recipientSuperappFactory: "0x77F9A5D05e37B0c1DAEbB425bf2C69Fa8d9BEF90",
    allo: "0x1133eA7Af70876e64665ecD07C0A0476d09465a1",
    alloRegistry: "0x4AAcca72145e1dF2aeC137E1f3C5E3D75DB8b5f3",
    cfaForwarder: "0xcfA132E353cB4E398080B9700609bb008eceB125",
    gdaForwarder: "0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08",
    tokens: [
      {
        symbol: "ETHx",
        address: "0x0043d7c85C8b96a49A72A92C0B48CdC4720437d7",
        icon: "/eth.png",
      },
      {
        symbol: "fDAIx",
        address: "0xD6FAF98BeFA647403cc56bDB598690660D5257d2",
        icon: "/dai.png",
      },
      {
        symbol: "F(S)",
        address: "0xf74EB650D8A806b92618d9E90A7E157C255c6406",
        icon: "/optimism.svg",
      },
    ],
  },
];

export { networks };
