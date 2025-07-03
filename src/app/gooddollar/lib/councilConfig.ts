export const councilConfig: {
  [key: string]: {
    councilAddress: string;
    gdaPool: string;
    stackApiKey: string;
    pointSystemId: number;
  };
} = {
  [42220]: {
    councilAddress: "0xa4c44743582208e7e4207d5947c87ad1a0e70aa0",
    gdaPool: "0xafcab1ab378354b8ce0dbd0ae2e2c0dea01dcf0b",
    stackApiKey: process.env.STACK_API_KEY_CELO!,
    pointSystemId: 7742,
  },
  [11155420]: {
    councilAddress: "0xf1bd7df8beea17f6f81a153b85e788390e684213",
    gdaPool: "0xcd0f380eafdd908d118c98c2b9456194fb23c1d5",
    stackApiKey: process.env.STACK_API_KEY_OP_SEPOLIA!,
    pointSystemId: 7717,
  },
};
