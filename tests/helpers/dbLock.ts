import { Client } from "@neondatabase/serverless";

// Every local and CI test run contends on this one key. The value is arbitrary
// but must never change, or old and new runs would stop excluding each other.
const LOCK_KEY = 8147326905;

const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const POLL_INTERVAL_MS = 2_000;

let holder: Client | null = null;

// Session-level advisory locks are silently useless on Neon's pooled endpoint:
// PgBouncer runs in transaction mode, so the statement after the lock can land
// on a different server connection. The lock must sit on a direct connection.
function directConnectionString(urlString: string): string {
  const url = new URL(urlString);
  url.hostname = url.hostname.replace("-pooler", "");
  return url.toString();
}

// pg_locks splits the 64-bit advisory key across classid (high word) and objid
// (low word), so recombine before matching — otherwise this reports unrelated
// advisory locks, including PgBouncer's own.
async function describeHolders(client: Client): Promise<string> {
  const { rows } = await client.query(
    `select coalesce(nullif(a.application_name, ''), 'an unnamed session') as who,
            date_trunc('second', now() - a.backend_start)::text as held
       from pg_locks l
       join pg_stat_activity a on a.pid = l.pid
      where l.locktype = 'advisory'
        and l.granted
        and a.pid <> pg_backend_pid()
        and (l.classid::bigint << 32) + l.objid::bigint = $1::bigint`,
    [LOCK_KEY],
  );

  if (rows.length === 0) return "no visible holder";

  return rows
    .map((r: { who: string; held: string }) => `${r.who}, connected ${r.held}`)
    .join("; ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireTestDbLock(label: string): Promise<void> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_URL is not set — put it in .env.test.local at the repo root",
    );
  }

  const timeoutMs = Number(
    process.env.TEST_DB_LOCK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
  );

  const client = new Client({
    connectionString: directConnectionString(connectionString),
    application_name: `test-db-lock:${label}`,
  });
  await client.connect();

  const deadline = Date.now() + timeoutMs;
  let warned = false;

  for (;;) {
    const { rows } = await client.query(
      "select pg_try_advisory_lock($1::bigint) as locked",
      [LOCK_KEY],
    );

    if (rows[0].locked) {
      holder = client;
      return;
    }

    if (Date.now() >= deadline) {
      const who = await describeHolders(client);
      await client.end();
      throw new Error(
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for the shared test database. ` +
          `Held by: ${who}. Another test run (local or CI) is using it; wait for it to finish.`,
      );
    }

    if (!warned) {
      warned = true;
      console.warn(
        `waiting for the shared test database — held by ${await describeHolders(client)}`,
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

// A dropped connection releases the lock, so a crashed or killed run cannot
// wedge it; this is only the tidy path.
export async function releaseTestDbLock(): Promise<void> {
  if (!holder) return;

  const client = holder;
  holder = null;

  try {
    await client.query("select pg_advisory_unlock($1::bigint)", [LOCK_KEY]);
  } finally {
    await client.end();
  }
}
