import { Kysely, CamelCasePlugin } from "kysely";
import { NeonDialect } from "kysely-neon";

const SCHEMA_NAME = "1";

interface Database {
  contributors: ContributorTable;
}

interface ContributorTable {
  chainId: number;
  name: string;
  address: string;
  score: number;
}

export const db = new Kysely<Database>({
  dialect: new NeonDialect({
    connectionString: process.env.DATABASE_URL,
  }),
  plugins: [new CamelCasePlugin()],
}).withSchema(SCHEMA_NAME);
