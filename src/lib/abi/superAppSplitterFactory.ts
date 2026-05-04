export const superAppSplitterFactoryAbi = [
  {
    type: "function",
    name: "createSuperAppSplitter",
    inputs: [
      { name: "_host", type: "address" },
      { name: "_acceptedToken", type: "address" },
      { name: "_admin", type: "address" },
      { name: "_mainRecipient", type: "address" },
      { name: "_feePortion", type: "int96" },
      { name: "_streamAdmins", type: "address[]" },
    ],
    outputs: [
      { name: "superAppSplitter", type: "address" },
    ],
    stateMutability: "nonpayable",
  },
] as const;
