export const councilConfig: {
  [key: string]: {
    councilAddress: string;
    stackApiKey: string;
    pointSystemId: number;
  };
} = {
  [42220]: {
    [42220]: { councilAddress: "0x3573af721603c67a2742d768718a52a40f8b6021" },
    stackApiKey: process.env.STACK_API_KEY_OP_SEPOLIA!,
    pointSystemId: 7717,
  },
  [11155420]: {
    councilAddress: "0xf1bd7df8beea17f6f81a153b85e788390e684213",
    stackApiKey: process.env.STACK_API_KEY_OP_SEPOLIA!,
    pointSystemId: 7717,
  },
};
