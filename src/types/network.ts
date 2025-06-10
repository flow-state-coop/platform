import { Address } from "viem";
import { Token } from "@/types/token";

export type Network = {
  id: number;
  name: string;
  label: string;
  icon: string;
  rpcUrl: string;
  blockExplorer: string;
  superfluidExplorer: string;
  superfluidDashboard: string;
  superfluidSubgraph: string;
  onRampLabel: string;
  flowSplitter: Address;
  flowSplitterSubgraph: string;
  flowCouncilFactory: string;
  flowCouncilSubgraph: string;
  flowStateEligibilityNft: string;
  flowStateEligibilityMinScore: number;
  superfluidHost: Address;
  superfluidResolver: Address;
  recipientSuperappFactory: Address;
  tokens: Token[];
  allo: Address;
  alloRegistry: Address;
  gdaForwarder: Address;
  cfaForwarder: Address;
};
