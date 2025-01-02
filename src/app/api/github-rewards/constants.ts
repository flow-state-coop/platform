import { optimism, arbitrum, base, optimismSepolia } from "wagmi/chains";
import { Address, Chain } from "viem";

const flowSplitter: {
  [id: number]: {
    address: Address;
    poolId: number;
  };
} = {
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
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTzWxJCKtviDCIxl4K1GbgjiDxZ_0G42KVKAltupsf_P0a23UoodMIELwuDCFV6QSJ9bQNWusFq9M2i/pub?gid=249454841&single=true&output=csv",
  8453: "https://docs.google.com/spreadsheets/d/1g-id77tiY0saYHWbsRfMHDSqFmB6urjKhGaXJSNtmxI/export?format=csv&id=1g-id77tiY0saYHWbsRfMHDSqFmB6urjKhGaXJSNtmxI&gid=0",
};

export { chains, flowSplitter, scoresCsvUrl };
