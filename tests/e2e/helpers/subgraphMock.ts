import type { Page } from "@playwright/test";
import { readFixture } from "./setup";
import { RECIPIENT_MANAGER_ROLE } from "@/app/flow-councils/lib/constants";

// The app issues several distinct GraphQL queries against flow-council and
// superfluid subgraphs. Each one requires a specific response shape — Apollo
// treats missing selected fields as errors, which in dev mode surfaces as
// an error overlay that blocks the UI. The single super-object below covers
// every field any of those queries selects; unused fields are harmless.
function buildFlowCouncilResponse() {
  const fx = readFixture();
  return {
    data: {
      flowCouncil: {
        id: "0xe2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0",
        maxVotingSpread: "100",
        superToken: "0x8043cbb06a8d8f9f2a6e14f95e08d16f62f27692",
        distributionPool: "0x0000000000000000000000000000000000000001",
        recipients: [],
        councilMembers: [],
        flowCouncilManagers: [
          { account: fx.walletAddress, role: RECIPIENT_MANAGER_ROLE },
        ],
        voters: [],
        rounds: [],
      },
    },
  };
}

const SPLITTER_POOL_ADDRESS =
  "0x0000000000000000000000000000000000000002";
const SPLITTER_TOKEN_ADDRESS =
  "0x8043cbb06a8d8f9f2a6e14f95e08d16f62f27692";
const SPLITTER_MEMBER_ADDRESS =
  "0x00000000000000000000000000000000000000aa";

// The splitter admin page reads the pool and its admin set from the Flow
// Splitter subgraph, then the token and GDA members from Superfluid's.
function buildFlowSplitterPoolResponse(admins?: string[]) {
  const fx = readFixture();
  return {
    data: {
      pools: [
        {
          poolAddress: SPLITTER_POOL_ADDRESS,
          name: "E2E Splitter",
          symbol: "E2E",
          token: SPLITTER_TOKEN_ADDRESS,
          metadata: JSON.stringify({ listed: true }),
          poolAdmins: (admins ?? [fx.walletAddress]).map((address) => ({
            address: address.toLowerCase(),
          })),
        },
      ],
    },
  };
}

const SPLITTER_SUPERFLUID_RESPONSE = {
  data: {
    token: { id: SPLITTER_TOKEN_ADDRESS, symbol: "USDCx" },
    pool: {
      id: SPLITTER_POOL_ADDRESS,
      poolMembers: [{ account: { id: SPLITTER_MEMBER_ADDRESS }, units: "100" }],
      poolDistributors: [],
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
export async function installSubgraphMock(
  page: Page,
  options: { splitterPoolAdmins?: string[] } = {},
): Promise<void> {
  const flowCouncilResponse = buildFlowCouncilResponse();
  const flowSplitterPoolResponse = buildFlowSplitterPoolResponse(
    options.splitterPoolAdmins,
  );
  await page.route(
    /goldsky\.com|superfluid\.dev|thegraph\.com|ormilabs\.com/i,
    async (route) => {
      const body = route.request().postData() ?? "";
      let payload: unknown;
      if (/flowCouncil\s*\(/.test(body) || /FlowCouncilQuery/.test(body)) {
        payload = flowCouncilResponse;
      } else if (/FlowSplitterPoolQuery/.test(body) || /pools\s*\(/.test(body)) {
        payload = flowSplitterPoolResponse;
      } else if (/poolMembers/.test(body) && /token\s*\(/.test(body)) {
        // The splitter pages select the token and the GDA pool in one query,
        // so the token-only response below would be missing a selected field.
        payload = SPLITTER_SUPERFLUID_RESPONSE;
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
