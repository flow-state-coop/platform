import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { networks } from "../src/lib/networks";

type FixtureEntry = {
  name: string;
  url: string;
  query: string;
};

const OP_SEPOLIA_CHAIN_ID = 11155420;

const FIXTURES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "tests",
  "fixtures",
  "subgraph",
);

function buildEntries(): FixtureEntry[] {
  const network = networks.find((n) => n.id === OP_SEPOLIA_CHAIN_ID);
  if (!network) {
    throw new Error(`OP Sepolia network not found in networks.ts`);
  }

  const entries: FixtureEntry[] = [];

  if (network.flowCouncilSubgraph) {
    entries.push({
      name: "flowCouncil",
      url: network.flowCouncilSubgraph,
      query: `{
        flowCouncils(first: 1) {
          id
          metadata
          voters { id address votingPower }
          grantees { id address }
        }
      }`,
    });
  }

  if (network.flowSplitterSubgraph) {
    entries.push({
      name: "flowSplitter",
      url: network.flowSplitterSubgraph,
      query: `{
        pools(first: 1) {
          id
          poolAddress
          totalUnits
        }
      }`,
    });
  }

  if (network.superfluidSubgraph) {
    entries.push({
      name: "superfluid",
      url: network.superfluidSubgraph,
      query: `{
        tokens(first: 1, where: { isSuperToken: true }) {
          id
          symbol
          name
          decimals
        }
      }`,
    });
  }

  return entries;
}

async function fetchFixture(entry: FixtureEntry): Promise<unknown> {
  const res = await fetch(entry.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: entry.query }),
  });
  if (!res.ok) {
    throw new Error(`${entry.name}: HTTP ${res.status} from ${entry.url}`);
  }
  return res.json();
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const entries = buildEntries();

  if (dryRun) {
    console.log("Dry run — would fetch from:");
    for (const entry of entries) {
      console.log(`  ${entry.name}: ${entry.url}`);
    }
    return;
  }

  mkdirSync(FIXTURES_DIR, { recursive: true });

  let failures = 0;
  for (const entry of entries) {
    try {
      const data = await fetchFixture(entry);
      const outPath = path.join(FIXTURES_DIR, `${entry.name}.json`);
      writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n", "utf8");
      console.log(`✓ ${entry.name} → ${outPath}`);
    } catch (err) {
      failures += 1;
      console.error(`✗ ${entry.name}:`, err);
    }
  }

  if (failures > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
