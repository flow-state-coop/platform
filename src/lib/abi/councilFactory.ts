export const councilFactoryAbi = [
  {
    type: "constructor",
    inputs: [
      { name: "_gdav1Forwarder", type: "address", internalType: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createCouncil",
    inputs: [
      {
        name: "config",
        type: "tuple",
        internalType: "struct CouncilFactory.DeploymentConfig",
        components: [
          { name: "metadata", type: "string", internalType: "string" },
          {
            name: "councilMembers",
            type: "tuple[]",
            internalType: "struct CouncilFactory.CouncilMember[]",
            components: [
              { name: "account", type: "address", internalType: "address" },
              { name: "votingPower", type: "uint256", internalType: "uint256" },
            ],
          },
          {
            name: "grantees",
            type: "tuple[]",
            internalType: "struct CouncilFactory.Grantee[]",
            components: [
              { name: "name", type: "string", internalType: "string" },
              { name: "account", type: "address", internalType: "address" },
            ],
          },
          {
            name: "distributionToken",
            type: "address",
            internalType: "address",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "gdav1Forwarder",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "CouncilCreated",
    inputs: [
      {
        name: "council",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "pool",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "metadata",
        type: "string",
        indexed: false,
        internalType: "string",
      },
    ],
    anonymous: false,
  },
  { type: "error", name: "GDAv1ForwarderMustBeAContract", inputs: [] },
] as const;
