export const councilConfig: {
  [key: string]: {
    councilAddress: string;
    gdaPool: string;
    stackApiKey: string;
    pointSystemId: number;
  };
} = {
  [42220]: {
    councilAddress: "0x3573af721603c67a2742d768718a52a40f8b6021",
    stackApiKey: process.env.STACK_API_KEY_OP_SEPOLIA!,
    pointSystemId: 7717,
    gdaPool: "0xb08666c5adfb791ef5c6c25fe4e5db743e0f409e",
  },
  [11155420]: {
    councilAddress: "0xf1bd7df8beea17f6f81a153b85e788390e684213",
    gdaPool: "0xcd0f380eafdd908d118c98c2b9456194fb23c1d5",
    stackApiKey: process.env.STACK_API_KEY_OP_SEPOLIA!,
    pointSystemId: 7717,
  },
};
