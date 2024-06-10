import { Address } from "viem";
import { ProjectMetadata } from "./project";

export type Recipient = {
  id: Address;
  recipientAddress: Address;
  superappAddress: Address;
  metadata: ProjectMetadata;
};
