import { optimism, arbitrum, base, optimismSepolia } from "wagmi/chains";
import { Address, Chain } from "viem";

const flowSplitter: {
  [id: number]: {
    address: Address;
    poolId: number;
  };
} = {
  8453: {
    address: "0x25b64c200cf3362bac6961353d38a1dbeb42e60e",
    poolId: 2,
  },
  11155420: {
    address: "0xd53B8Bed28E122eA20dCC90d3991a614EC163a21",
    poolId: 17,
  },
};

const chains: { [id: number]: Chain } = {
  10: optimism,
  42161: arbitrum,
  8453: base,
  11155420: optimismSepolia,
};

const scoresCsvUrl: { [id: number]: string } = {
  11155420:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRpgQJ1jLGd9oFEMw7JjfKeC8322XypQe4pKdPlNbMXMO9-ZCDxHoNzwF0ygSvr66rExqdo-KWp9o86/pub?gid=0&single=true&output=csv",
  8453: "https://docs.google.com/spreadsheets/d/1g-id77tiY0saYHWbsRfMHDSqFmB6urjKhGaXJSNtmxI/export?format=csv&id=1g-id77tiY0saYHWbsRfMHDSqFmB6urjKhGaXJSNtmxI&gid=0",
};

export { chains, flowSplitter, scoresCsvUrl };
