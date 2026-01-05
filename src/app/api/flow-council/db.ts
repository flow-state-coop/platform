import { Kysely, CamelCasePlugin } from "kysely";
import { NeonDialect } from "kysely-neon";
import type { DB } from "@/generated/kysely";

export const db = new Kysely<DB>({
  dialect: new NeonDialect({
    connectionString: process.env.COUNCIL_DATABASE_URL,
  }),
  plugins: [new CamelCasePlugin()],
});
