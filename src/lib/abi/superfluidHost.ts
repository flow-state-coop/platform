export const superfluidHostAbi = [
  {
    inputs: [
      {
        internalType: "contract ISuperAgreement",
        name: "agreementClass",
        type: "address",
      },
      { internalType: "bytes", name: "callData", type: "bytes" },
      { internalType: "bytes", name: "userData", type: "bytes" },
    ],
    name: "callAgreement",
    outputs: [{ internalType: "bytes", name: "returnedData", type: "bytes" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "uint32", name: "operationType", type: "uint32" },
          { internalType: "address", name: "target", type: "address" },
          { internalType: "bytes", name: "data", type: "bytes" },
        ],
        internalType: "struct ISuperfluid.Operation[]",
        name: "operations",
        type: "tuple[]",
      },
    ],
    name: "batchCall",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
