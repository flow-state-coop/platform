export const superAppSplitterAbi = [
  {
    type: "function",
    name: "FEE_PORTION",
    inputs: [],
    outputs: [{ name: "", type: "int96" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ACCEPTED_TOKEN",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasRole",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "closeIncomingStreams",
    inputs: [{ name: "froms", type: "address[]" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "roundEndsAt",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isRoundClosed",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setRoundEnd",
    inputs: [{ name: "endsAt", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
