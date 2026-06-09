import { describe, it, expect } from "vitest";
import { CHUNK_SIZE, splitIntoChunks } from "./chunkQueue";

// Spec: "The app splits the operation into N transactions of a safe size."
// Impl-plan: "CHUNK_SIZE = 50 (conservative Celo gas estimate, ~50 voters per updateVoters call)"
// Impl-plan: "splitIntoChunks<T>(items: T[], size: number): T[][]"

// ---------------------------------------------------------------------------
// CHUNK_SIZE constant
// ---------------------------------------------------------------------------

describe("CHUNK_SIZE", () => {
  it("equals 50", () => {
    expect(CHUNK_SIZE).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// splitIntoChunks
// ---------------------------------------------------------------------------

describe("splitIntoChunks", () => {
  it("splits 123 items into chunks of 50 with lengths [50, 50, 23]", () => {
    const items = Array.from({ length: 123 }, (_, i) => i);
    const chunks = splitIntoChunks(items, 50);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(50);
    expect(chunks[1].length).toBe(50);
    expect(chunks[2].length).toBe(23);
  });

  it("returns an empty array when input is empty", () => {
    expect(splitIntoChunks([], 50)).toEqual([]);
  });

  it("returns a single chunk when count is less than size", () => {
    const items = [1, 2, 3];
    const chunks = splitIntoChunks(items, 50);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toEqual([1, 2, 3]);
  });

  it("returns a single chunk when count exactly equals size", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const chunks = splitIntoChunks(items, 50);
    expect(chunks.length).toBe(1);
    expect(chunks[0].length).toBe(50);
  });

  it("preserves item identity and order within each chunk", () => {
    const items = ["a", "b", "c", "d", "e"];
    const chunks = splitIntoChunks(items, 2);
    expect(chunks[0]).toEqual(["a", "b"]);
    expect(chunks[1]).toEqual(["c", "d"]);
    expect(chunks[2]).toEqual(["e"]);
  });

  it("returns a single chunk when size >= length (size equal to length)", () => {
    const items = [10, 20, 30];
    const chunks = splitIntoChunks(items, 3);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toEqual([10, 20, 30]);
  });

  it("returns a single chunk when size > length", () => {
    const items = [10, 20, 30];
    const chunks = splitIntoChunks(items, 100);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toEqual([10, 20, 30]);
  });

  it("throws or treats size 0 as size 1 — does not produce infinite loop", () => {
    // The implementation must guard against size <= 0.
    // We test that calling with size=0 either throws a clear error or
    // produces chunks of size 1 (each item its own chunk).
    // If it throws, that's valid. If it returns something, each chunk must be non-empty.
    const items = [1, 2, 3];
    let result: number[][] | undefined;
    let threw = false;
    try {
      result = splitIntoChunks(items, 0);
    } catch {
      threw = true;
    }
    if (!threw) {
      // Must not produce empty chunks or an infinite-length result
      expect(result).toBeDefined();
      expect(result!.length).toBeGreaterThan(0);
      for (const chunk of result!) {
        expect(chunk.length).toBeGreaterThan(0);
      }
    }
  });

  it("throws or treats negative size as size 1 — does not produce infinite loop", () => {
    const items = [1, 2, 3];
    let result: number[][] | undefined;
    let threw = false;
    try {
      result = splitIntoChunks(items, -10);
    } catch {
      threw = true;
    }
    if (!threw) {
      expect(result).toBeDefined();
      expect(result!.length).toBeGreaterThan(0);
      for (const chunk of result!) {
        expect(chunk.length).toBeGreaterThan(0);
      }
    }
  });

  it("works with object items (generic T)", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const chunks = splitIntoChunks(items, 2);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toEqual([{ id: 1 }, { id: 2 }]);
    expect(chunks[1]).toEqual([{ id: 3 }]);
  });

  it("does not mutate the original array", () => {
    const items = [1, 2, 3, 4, 5];
    const copy = [...items];
    splitIntoChunks(items, 2);
    expect(items).toEqual(copy);
  });

  it("splits exactly 100 items into two chunks of 50 using CHUNK_SIZE", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const chunks = splitIntoChunks(items, CHUNK_SIZE);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(50);
    expect(chunks[1].length).toBe(50);
  });
});
