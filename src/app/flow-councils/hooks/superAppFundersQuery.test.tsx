import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { networks } from "@/lib/networks";
import useSuperAppFundersQuery from "./superAppFundersQuery";

vi.mock("@apollo/client", () => ({
  gql: (strings: TemplateStringsArray) => strings.join(""),
  useQuery: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }));
vi.mock("wagmi", () => ({ useReadContracts: vi.fn() }));
vi.mock("@/lib/apollo", () => ({ getApolloClient: vi.fn() }));

import { useQuery as useApolloQuery } from "@apollo/client";
import { useQuery as useFetchQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";

const network = networks.find((n) => n.id === 42220)!;
const splitter = "0xF4dFAaBBc75bD9DbD31499236e5c06eBa0d3dAb8";
const token = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";
const treasury = "0x84b44c40f4fd93e222598728ad4e9655eba0b6ee";
const closed = "0x9f080983c678c6639f9a4de8f1feace2b2a1a54c";
const small = "0x8a941e9b6b7c67ce07cf9bf5ef16c3ef6b90b6f9";
const pool = {
  totalAmountFlowedDistributedUntilUpdatedAt: "950",
  updatedAtTimestamp: 1_787_904_508,
};

const success = (result: bigint) => ({ status: "success" as const, result });

beforeEach(() => {
  (useApolloQuery as Mock).mockReturnValue({
    data: {
      account: {
        accountTokenSnapshots: [
          {
            totalInflowRate: "10",
            totalNetFlowRate: "3",
            totalAmountStreamedInUntilUpdatedAt: "19",
            updatedAtTimestamp: "1787890074",
          },
        ],
        inflows: [{ sender: { id: closed } }, { sender: { id: small } }],
      },
    },
  });
  (useFetchQuery as Mock).mockReturnValue({
    data: [treasury, small.toUpperCase().replace("0X", "0x")],
  });
});

describe("useSuperAppFundersQuery", () => {
  it("verifies the union of indexed and explorer senders on-chain and reports chain state", () => {
    (useReadContracts as Mock).mockReturnValue({
      data: [
        success(140n),
        success(-133n),
        success(50n),
        success(0n),
        success(5n),
        success(135n),
      ],
    });

    const { result } = renderHook(() =>
      useSuperAppFundersQuery(network, splitter, token, true, pool),
    );

    const { contracts } = (useReadContracts as Mock).mock.calls.at(-1)![0];
    expect(
      contracts.map((c: { functionName: string }) => c.functionName),
    ).toEqual([
      "getAccountFlowrate",
      "getNetFlow",
      "FEE_PORTION",
      "getFlowrate",
      "getFlowrate",
      "getFlowrate",
    ]);
    expect(
      contracts.slice(3).map((c: { args: string[] }) => c.args[1]),
    ).toEqual([closed, small, treasury]);
    expect(result.current).toEqual({
      totalInflowRate: "140",
      totalNetFlowRate: "7",
      totalAmountStreamedInUntilUpdatedAt: "1000",
      updatedAtTimestamp: pool.updatedAtTimestamp,
      funderCount: 2,
    });
  });

  it("keeps the indexed snapshot while the chain reads are pending", () => {
    (useReadContracts as Mock).mockReturnValue({ data: undefined });

    const { result } = renderHook(() =>
      useSuperAppFundersQuery(network, splitter, token, true, pool),
    );

    expect(result.current).toMatchObject({
      totalInflowRate: "10",
      totalAmountStreamedInUntilUpdatedAt: "19",
      funderCount: 2,
    });
  });

  it("trusts the index on chains where it is reliable", () => {
    (useReadContracts as Mock).mockReturnValue({ data: undefined });
    const base = networks.find((n) => n.id === 8453)!;

    const { result } = renderHook(() =>
      useSuperAppFundersQuery(base, splitter, token, true, pool),
    );

    expect((useFetchQuery as Mock).mock.calls.at(-1)![0].enabled).toBe(false);
    expect((useReadContracts as Mock).mock.calls.at(-1)![0].query.enabled).toBe(
      false,
    );
    expect(result.current).toMatchObject({
      totalInflowRate: "10",
      funderCount: 2,
    });
  });

  it("skips every query when disabled or the splitter is missing", () => {
    (useReadContracts as Mock).mockReturnValue({ data: undefined });

    renderHook(() => useSuperAppFundersQuery(network, null, token, true, pool));

    expect((useApolloQuery as Mock).mock.calls.at(-1)![1].skip).toBe(true);
    expect((useFetchQuery as Mock).mock.calls.at(-1)![0].enabled).toBe(false);
    expect((useReadContracts as Mock).mock.calls.at(-1)![0].query.enabled).toBe(
      false,
    );
  });
});
