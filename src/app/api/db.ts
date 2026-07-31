import { Kysely, CamelCasePlugin } from "kysely";
import { NeonDialect } from "kysely-neon";
import type { DB } from "@/generated/kysely";

// The top-level `ws` pin in package.json belongs to this connection, which is
// the only reason a REST app depends on a WebSocket library. It is not what
// carries the connection, though: no `webSocketConstructor` is configured here,
// so Neon falls back to the global WebSocket that Node provides. The pin exists
// to hold kysely-neon's optional `ws` peer inside its declared `^8.13.0`, which
// pnpm otherwise satisfies with the v7 hoisted out of viem's isomorphic-ws.

export const db = new Kysely<DB>({
  dialect: new NeonDialect({
    connectionString: process.env.COUNCIL_DATABASE_URL,
  }),
  plugins: [new CamelCasePlugin()],
});
