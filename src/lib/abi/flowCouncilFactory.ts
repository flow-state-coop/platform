export const flowCouncilFactoryAbi = [
  {
    type: "function",
    name: "createFlowCouncil",
    inputs: [
      { name: "metadata", type: "string", internalType: "string" },
      {
        name: "superToken",
        type: "address",
        internalType: "contract ISuperToken",
      },
    ],
    outputs: [
      {
        name: "flowCouncil",
        type: "address",
        internalType: "contract FlowCouncil",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "FlowCouncilCreated",
    inputs: [
      {
        name: "flowCouncil",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "distributionPool",
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
] as const;
