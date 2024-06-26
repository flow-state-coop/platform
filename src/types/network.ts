import { Address } from "viem";
import { Token } from "@/types/token";

export type Network = {
  id: number;
  name: string;
  icon: string;
  superfluidConsole: string;
  superfluidSubgraph: string;
  passportDecoder: Address;
  superfluidHost: Address;
  superfluidResolver: Address;
  recipientSuperappFactory: Address;
  tokens: Token[];
  allo: Address;
  alloRegistry: Address;
  gdaForwarder: Address;
};
