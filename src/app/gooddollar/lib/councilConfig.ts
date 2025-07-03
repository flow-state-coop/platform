export const councilConfig: {
  [key: string]: {
    councilAddress: string;
    stackApiKey: string;
    pointSystemId: number;
  };
} = {
  [42220]: {
    councilAddress: "0xa4c44743582208e7e4207d5947c87ad1a0e70aa0",
    stackApiKey: process.env.STACK_API_KEY_CELO!,
    pointSystemId: 7742,
  },
  [11155420]: {
    councilAddress: "0xf1bd7df8beea17f6f81a153b85e788390e684213",
    stackApiKey: process.env.STACK_API_KEY_OP_SEPOLIA!,
    pointSystemId: 7717,
  },
};
