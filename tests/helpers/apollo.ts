import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MockedProvider } from "@apollo/client/testing";
import type { MockedResponse } from "@apollo/client/testing";

const FIXTURES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "subgraph",
);

export function loadSubgraphFixture<T = unknown>(name: string): T {
  const filePath = path.join(FIXTURES_DIR, `${name}.json`);
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export { MockedProvider };
export type { MockedResponse };
