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
] as const;
