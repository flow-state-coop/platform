export const markeeLeaderboardAbi = [
  {
    inputs: [],
    name: "minimumPrice",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "maxMessageLength",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "limit", type: "uint256" }],
    name: "getTopMarkees",
    outputs: [
      { name: "topAddresses", type: "address[]" },
      { name: "topFunds", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "message", type: "string" },
      { name: "name", type: "string" },
    ],
    name: "createMarkee",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ name: "markeeAddress", type: "address" }],
    name: "addFunds",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

export const markeeAbi = [
  {
    inputs: [],
    name: "message",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
