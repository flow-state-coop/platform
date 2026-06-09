import { describe, it, expect } from "vitest";
import {
  serializeQueue,
  deserializeQueue,
  type QueueState,
} from "./queueStorage";

// The queue is persisted to localStorage as JSON, but wagmi writeContract args
// carry BigInt values (a voter's votingPower, the council-wide spread) which
// JSON.stringify cannot handle. serializeQueue/deserializeQueue must round-trip
// those BigInts byte-for-byte so a hydrated queue replays identical txs.

const BIGINT_TAG = "__bigint__";

describe("serializeQueue / deserializeQueue BigInt round-trip", () => {
  it("restores BigInt values nested inside chunk args (arrays + objects)", () => {
    const state: QueueState = {
      councilId: "0xCouncil",
      completedCount: 1,
      chunks: [
        {
          args: {
            address: "0xCouncil",
            functionName: "updateVoters",
            args: [
              [
                { account: "0xa", votingPower: BigInt("1000000000000000000") },
                { account: "0xb", votingPower: BigInt(0) },
              ],
              BigInt(42),
            ],
          },
        },
      ],
    };

    const restored = deserializeQueue(serializeQueue(state));

    expect(restored).not.toBeNull();
    const restoredArgs = restored!.chunks[0].args.args as [
      { account: string; votingPower: bigint }[],
      bigint,
    ];
    expect(typeof restoredArgs[0][0].votingPower).toBe("bigint");
    expect(restoredArgs[0][0].votingPower).toBe(BigInt("1000000000000000000"));
    expect(restoredArgs[0][1].votingPower).toBe(BigInt(0));
    expect(typeof restoredArgs[1]).toBe("bigint");
    expect(restoredArgs[1]).toBe(BigInt(42));
  });

  it("round-trips deeply equal for a state with no BigInts", () => {
    const state: QueueState = {
      councilId: "0xabc",
      completedCount: 0,
      chunks: [{ args: { functionName: "updateVoters", args: [[], 0] } }],
    };

    expect(deserializeQueue(serializeQueue(state))).toEqual(state);
  });

  it("restores a negative BigInt", () => {
    const state: QueueState = {
      councilId: "0xabc",
      completedCount: 0,
      chunks: [{ args: { value: BigInt(-7) } }],
    };

    const restored = deserializeQueue(serializeQueue(state));
    expect(restored!.chunks[0].args.value).toBe(BigInt(-7));
  });

  it("persists the opaque meta verbatim", () => {
    const meta = {
      chainId: 42220,
      councilId: "0xabc",
      groupId: 3,
      removalAddresses: ["0x1", "0x2"],
      removalOffset: 5,
      addedOrder: ["0x3"],
      insertedAddresses: ["0x3"],
    };
    const state: QueueState = {
      councilId: "0xabc",
      completedCount: 2,
      chunks: [{ args: { foo: "bar" } }],
      meta,
    };

    const restored = deserializeQueue(serializeQueue(state));
    expect(restored!.meta).toEqual(meta);
  });
});

describe("deserializeQueue reviver does not coerce lookalikes", () => {
  const stateWith = (value: unknown): string =>
    JSON.stringify({
      councilId: "0xabc",
      completedCount: 0,
      chunks: [{ args: { value } }],
    });

  it("ignores a tag object with extra keys", () => {
    const restored = deserializeQueue(
      stateWith({ [BIGINT_TAG]: "5", extra: 1 }),
    );
    expect(restored!.chunks[0].args.value).toEqual({
      [BIGINT_TAG]: "5",
      extra: 1,
    });
  });

  it("ignores a tag whose value is a number, not a decimal string", () => {
    const restored = deserializeQueue(stateWith({ [BIGINT_TAG]: 5 }));
    expect(restored!.chunks[0].args.value).toEqual({ [BIGINT_TAG]: 5 });
  });

  it("ignores a tag whose string is not a valid integer", () => {
    const restored = deserializeQueue(stateWith({ [BIGINT_TAG]: "12ab" }));
    expect(restored!.chunks[0].args.value).toEqual({ [BIGINT_TAG]: "12ab" });
  });
});

describe("deserializeQueue rejects malformed input", () => {
  it("returns null for non-JSON", () => {
    expect(deserializeQueue("not json {")).toBeNull();
  });

  it("returns null when councilId is missing", () => {
    expect(
      deserializeQueue(JSON.stringify({ completedCount: 0, chunks: [] })),
    ).toBeNull();
  });

  it("returns null when chunks is not an array", () => {
    expect(
      deserializeQueue(
        JSON.stringify({ councilId: "0x", completedCount: 0, chunks: {} }),
      ),
    ).toBeNull();
  });

  it("returns null when completedCount is not a number", () => {
    expect(
      deserializeQueue(
        JSON.stringify({ councilId: "0x", completedCount: "0", chunks: [] }),
      ),
    ).toBeNull();
  });

  it("returns null when a chunk is missing its args object", () => {
    expect(
      deserializeQueue(
        JSON.stringify({
          councilId: "0x",
          completedCount: 0,
          chunks: [{ notArgs: 1 }],
        }),
      ),
    ).toBeNull();
  });

  it("returns null when a chunk's args is null", () => {
    expect(
      deserializeQueue(
        JSON.stringify({
          councilId: "0x",
          completedCount: 0,
          chunks: [{ args: null }],
        }),
      ),
    ).toBeNull();
  });

  it("accepts an empty chunks array", () => {
    const restored = deserializeQueue(
      JSON.stringify({ councilId: "0x", completedCount: 0, chunks: [] }),
    );
    expect(restored).toEqual({
      councilId: "0x",
      completedCount: 0,
      chunks: [],
      meta: undefined,
    });
  });
});
