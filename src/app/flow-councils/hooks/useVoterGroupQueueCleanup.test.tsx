import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { CHUNK_SIZE } from "../lib/chunkQueue";
import type { VoterGroupQueueMeta } from "../membership/voterTableTypes";
import { useVoterGroupQueueCleanup } from "./useVoterGroupQueueCleanup";

// useVoterGroupQueueCleanup reconciles the offchain DB with what the chunked
// onchain queue actually committed. The committed prefix is the first
// `completedCount * CHUNK_SIZE` entries, ordered adds → edits → removals:
//  - finalize() (full completion) drops every removal's DB row;
//  - discard() (partial stop) rolls back inserted adds past the prefix AND
//    drops removals within the prefix (already zeroed onchain).
// This is the off-by-one-prone math that regressed once, so it is pinned here.

const addrs = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

const makeMeta = (
  overrides: Partial<VoterGroupQueueMeta> = {},
): VoterGroupQueueMeta => ({
  chainId: 42220,
  councilId: "0xcouncil",
  groupId: 1,
  removalAddresses: [],
  removalOffset: 0,
  addedOrder: [],
  insertedAddresses: [],
  ...overrides,
});

type Queue = {
  clear: Mock;
  completedCount: number;
  totalCount: number;
  isPending: boolean;
  meta?: VoterGroupQueueMeta;
};

const makeQueue = (overrides: Partial<Queue> = {}): Queue => ({
  clear: vi.fn(),
  completedCount: 0,
  totalCount: 3,
  isPending: false,
  ...overrides,
});

const okFetch = (): Mock =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true }),
  });

// Flatten the addresses across every DELETE request the hook issued.
const deletedAddresses = (fetchMock: Mock): string[] =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === "DELETE")
    .flatMap(
      ([, init]) => JSON.parse(init.body as string).addresses as string[],
    );

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("discard — inserted-add rollback (committed prefix kept)", () => {
  it("rolls back only inserted adds past the committed prefix", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    // One chunk done => the first CHUNK_SIZE adds committed, the rest roll back.
    const added = addrs("a", CHUNK_SIZE + 10);
    const q = makeQueue({
      completedCount: 1,
      meta: makeMeta({
        addedOrder: added,
        insertedAddresses: added,
        removalOffset: added.length,
      }),
    });

    const { result } = renderHook(() => useVoterGroupQueueCleanup(q, vi.fn()));
    await act(async () => {
      await result.current.discard();
    });

    expect(deletedAddresses(fetchMock)).toEqual(added.slice(CHUNK_SIZE));
    expect(q.clear).toHaveBeenCalledTimes(1);
  });

  it("rolls back every inserted add when nothing committed (completedCount 0)", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const added = addrs("a", 5);
    const q = makeQueue({
      completedCount: 0,
      meta: makeMeta({
        addedOrder: added,
        insertedAddresses: added,
        removalOffset: 5,
      }),
    });

    const { result } = renderHook(() => useVoterGroupQueueCleanup(q, vi.fn()));
    await act(async () => {
      await result.current.discard();
    });

    expect(deletedAddresses(fetchMock)).toEqual(added);
  });

  it("intersects the past-prefix and actually-inserted sets", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    // Staged adds where only the later ones were inserted (earlier ones were
    // conflict-skipped). The committed prefix covers the first CHUNK_SIZE, so
    // only inserted adds past it roll back; inserted-but-committed ones stay.
    const added = addrs("a", CHUNK_SIZE + 10);
    const q = makeQueue({
      completedCount: 1,
      meta: makeMeta({
        addedOrder: added,
        insertedAddresses: added.slice(CHUNK_SIZE - 10),
        removalOffset: added.length,
      }),
    });

    const { result } = renderHook(() => useVoterGroupQueueCleanup(q, vi.fn()));
    await act(async () => {
      await result.current.discard();
    });

    expect(deletedAddresses(fetchMock)).toEqual(added.slice(CHUNK_SIZE));
  });
});

describe("discard — committed-removal cleanup (Issue 1 fix)", () => {
  it("drops removals within the committed prefix", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    // No adds/edits ahead of removals (offset 0); 1 chunk done => the first
    // CHUNK_SIZE removals were zeroed onchain and must lose their DB membership.
    const removed = addrs("r", CHUNK_SIZE + 10);
    const q = makeQueue({
      completedCount: 1,
      meta: makeMeta({ removalAddresses: removed, removalOffset: 0 }),
    });

    const { result } = renderHook(() => useVoterGroupQueueCleanup(q, vi.fn()));
    await act(async () => {
      await result.current.discard();
    });

    expect(deletedAddresses(fetchMock)).toEqual(removed.slice(0, CHUNK_SIZE));
    expect(q.clear).toHaveBeenCalledTimes(1);
  });

  it("accounts for the removal offset (adds + edits ahead of removals)", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    // (CHUNK_SIZE - 10) entries (adds+edits) precede the removal block; one
    // chunk done leaves 10 of the committed prefix inside the removal block, so
    // exactly 10 removals are committed and dropped.
    const offset = CHUNK_SIZE - 10;
    const removed = addrs("r", 30);
    const q = makeQueue({
      completedCount: 1,
      meta: makeMeta({ removalAddresses: removed, removalOffset: offset }),
    });

    const { result } = renderHook(() => useVoterGroupQueueCleanup(q, vi.fn()));
    await act(async () => {
      await result.current.discard();
    });

    expect(deletedAddresses(fetchMock)).toEqual(removed.slice(0, 10));
  });

  it("drops nothing while the prefix is still inside the edits region", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    // All adds committed (offset > committedEntries means removals untouched),
    // but no removal has landed yet: nothing to delete, queue still cleared.
    const added = addrs("a", 10);
    const removed = addrs("r", 10);
    const q = makeQueue({
      completedCount: 1,
      meta: makeMeta({
        addedOrder: added,
        insertedAddresses: added,
        removalAddresses: removed,
        removalOffset: CHUNK_SIZE + 20,
      }),
    });

    const { result } = renderHook(() => useVoterGroupQueueCleanup(q, vi.fn()));
    await act(async () => {
      await result.current.discard();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(q.clear).toHaveBeenCalledTimes(1);
  });

  it("never deletes more removals than exist (committedEntries past the block)", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const removed = addrs("r", 5);
    const q = makeQueue({
      completedCount: 3,
      totalCount: 4,
      meta: makeMeta({ removalAddresses: removed, removalOffset: 0 }),
    });

    const { result } = renderHook(() => useVoterGroupQueueCleanup(q, vi.fn()));
    await act(async () => {
      await result.current.discard();
    });

    expect(deletedAddresses(fetchMock)).toEqual(removed);
  });

  it("surfaces a cleanup error when a discard delete fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ success: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const removed = addrs("r", 10);
    const q = makeQueue({
      completedCount: 1,
      meta: makeMeta({ removalAddresses: removed, removalOffset: 0 }),
    });

    const { result } = renderHook(() => useVoterGroupQueueCleanup(q, vi.fn()));
    await act(async () => {
      await result.current.discard();
    });

    expect(result.current.cleanupError).not.toBe("");
    expect(q.clear).toHaveBeenCalledTimes(1);
  });
});

describe("finalize — full completion", () => {
  it("drops every removal's DB row then refreshes", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const refresh = vi.fn().mockResolvedValue(undefined);

    const removed = addrs("r", 3);
    const q = makeQueue({
      completedCount: 2,
      totalCount: 2,
      meta: makeMeta({ removalAddresses: removed, removalOffset: 0 }),
    });

    renderHook(() => useVoterGroupQueueCleanup(q, refresh));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(deletedAddresses(fetchMock)).toEqual(removed);
  });

  it("refreshes without any DELETE when there are no removals", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const refresh = vi.fn().mockResolvedValue(undefined);

    const q = makeQueue({
      completedCount: 2,
      totalCount: 2,
      meta: makeMeta(),
    });

    renderHook(() => useVoterGroupQueueCleanup(q, refresh));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not finalize while the queue is incomplete", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const refresh = vi.fn().mockResolvedValue(undefined);

    const q = makeQueue({
      completedCount: 1,
      totalCount: 2,
      meta: makeMeta({ removalAddresses: addrs("r", 3) }),
    });

    renderHook(() => useVoterGroupQueueCleanup(q, refresh));

    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not finalize while a chunk is still pending", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const refresh = vi.fn().mockResolvedValue(undefined);

    const q = makeQueue({
      completedCount: 2,
      totalCount: 2,
      isPending: true,
      meta: makeMeta({ removalAddresses: addrs("r", 3) }),
    });

    renderHook(() => useVoterGroupQueueCleanup(q, refresh));

    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
