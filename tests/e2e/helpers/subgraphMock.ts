import type { Page } from "@playwright/test";

// The app issues several distinct GraphQL queries against flow-council and
// superfluid subgraphs. Each one requires a specific response shape — Apollo
// treats missing selected fields as errors, which in dev mode surfaces as
// an error overlay that blocks the UI. The single super-object below covers
// every field any of those queries selects; unused fields are harmless.
const FLOW_COUNCIL_RESPONSE = {
  data: {
    flowCouncil: {
      id: "0xe2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0",
      maxVotingSpread: "100",
      superToken: "0x8043cbb06a8d8f9f2a6e14f95e08d16f62f27692",
      distributionPool: "0x0000000000000000000000000000000000000001",
      recipients: [],
      councilMembers: [],
      rounds: [],
    },
  },
};

const TOKEN_RESPONSE = {
  data: {
    token: {
      id: "0x8043cbb06a8d8f9f2a6e14f95e08d16f62f27692",
      symbol: "USDCx",
      underlyingAddress: "0x0000000000000000000000000000000000000000",
      decimals: 18,
    },
  },
};

const POOL_RESPONSE = {
  data: {
    pool: {
      id: "0x0000000000000000000000000000000000000001",
      flowRate: "0",
      adjustmentFlowRate: "0",
      totalUnits: "0",
      totalAmountFlowedDistributedUntilUpdatedAt: "0",
      updatedAtTimestamp: "0",
      poolMembers: [],
      poolDistributors: [],
    },
  },
};

// Dispatcher: inspect the POST body and return a canned response. For
// queries we don't explicitly handle, return `{ <field>: null }` — Apollo
// accepts null results but errors on missing selected fields. Extracting
// the top-level field name from the query string makes the fallback safe
// for any unknown subgraph query the app issues.
export async function installSubgraphMock(page: Page): Promise<void> {
  await page.route(
    /goldsky\.com|superfluid\.dev|thegraph\.com|ormilabs\.com/i,
    async (route) => {
      const body = route.request().postData() ?? "";
      let payload: unknown;
      if (/flowCouncil\s*\(/.test(body) || /FlowCouncilQuery/.test(body)) {
        payload = FLOW_COUNCIL_RESPONSE;
      } else if (/token\s*\(/.test(body) || /SuperfluidQuery/.test(body)) {
        payload = TOKEN_RESPONSE;
      } else if (/pool\s*\(/.test(body)) {
        payload = POOL_RESPONSE;
      } else {
        // Unknown query — return a GraphQL error response. Apollo surfaces
        // this as a normal errorPolicy result instead of a missing-field
        // cache-write crash, and the dev overlay stays quiet.
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            errors: [{ message: "mocked: unsupported query in E2E" }],
          }),
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    },
  );
}
