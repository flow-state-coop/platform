import { Address, Hex } from "viem";

export type TransactionCall = {
  to: Address;
  data: Hex;
  value?: bigint;
};
