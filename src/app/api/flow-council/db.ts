import { Kysely, CamelCasePlugin } from "kysely";
import { NeonDialect } from "kysely-neon";

const SCHEMA_NAME = "1";

interface Database {
  applications: ApplicationTable;
  supEpochs: SupEpochs;
  supAddresses: SupAddresses;
}

interface ApplicationTable {
  owner: string;
  recipient: string;
  chainId: number;
  councilId: string;
  metadata: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
}

interface SupEpochs {
  id: number;
  chainId: number;
  startTimestamp: number;
  endTimestamp: number;
}

interface SupAddresses {
  address: string;
  chainId: number;
  epoch: number;
  eventEmitted: SupEvent;
}

export type SupEvent = "voted" | "shared-vote" | "shared-distribution";

export const db = new Kysely<Database>({
  dialect: new NeonDialect({
    connectionString: process.env.COUNCIL_DATABASE_URL,
  }),
  plugins: [new CamelCasePlugin()],
}).withSchema(SCHEMA_NAME);
