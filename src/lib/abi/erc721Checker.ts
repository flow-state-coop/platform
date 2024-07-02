export const erc721CheckerAbi = [
  {
    type: "constructor",
    inputs: [
      { name: "definitiveERC721", type: "address", internalType: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "erc721",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract IERC721" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isValidAllocator",
    inputs: [{ name: "_allocator", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
];
