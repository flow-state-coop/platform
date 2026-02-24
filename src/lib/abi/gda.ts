export const gdaAbi = [
  {
    inputs: [
      {
        internalType: "contract ISuperfluidPool",
        name: "pool",
        type: "address",
      },
      { internalType: "address", name: "memberAddr", type: "address" },
      { internalType: "bytes", name: "ctx", type: "bytes" },
    ],
    name: "tryConnectPoolFor",
    outputs: [
      { internalType: "bool", name: "success", type: "bool" },
      { internalType: "bytes", name: "newCtx", type: "bytes" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "contract ISuperfluidPool",
        name: "pool",
        type: "address",
      },
      { internalType: "address", name: "memberAddress", type: "address" },
      { internalType: "uint128", name: "newUnits", type: "uint128" },
      { internalType: "bytes", name: "ctx", type: "bytes" },
    ],
    name: "updateMemberUnits",
    outputs: [{ internalType: "bytes", name: "newCtx", type: "bytes" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
