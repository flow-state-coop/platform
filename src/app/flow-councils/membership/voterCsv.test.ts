import { describe, it, expect } from "vitest";
import { computeCsvSync, buildCsvRows } from "./voterCsv";
import type { NewRow, SubgraphVoter } from "./voterTableTypes";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";

function voter(account: string, votingPower: string): SubgraphVoter {
  return { id: account, account, votingPower };
}

describe("computeCsvSync", () => {
  it("updates changed members, keeps unchanged, removes absent, adds new", () => {
    const voters = [voter(A, "10"), voter(B, "20")];

    const result = computeCsvSync(
      [
        [A, "15"], // changed 10 -> 15
        [C, "30"], // new
      ],
      voters,
      new Set(),
      10,
    );

    expect(result.nextEdited).toEqual({ [A.toLowerCase()]: "15" });
    // B is absent from the file -> staged for removal.
    expect([...result.nextRemoved]).toEqual([B.toLowerCase()]);
    expect(result.nextNew).toEqual([{ address: C.toLowerCase(), votes: "30" }]);
    expect(result.skipped).toBe(0);
  });

  it("does not stage an edit when the file repeats the current votes", () => {
    const result = computeCsvSync([[A, "10"]], [voter(A, "10")], new Set(), 10);

    expect(result.nextEdited).toEqual({});
    expect(result.nextRemoved.size).toBe(0);
    expect(result.nextNew).toEqual([]);
  });

  it("falls back to defaultVotingPower for missing/invalid vote columns", () => {
    const result = computeCsvSync(
      [
        [A], // no votes column on an existing member
        [C, "abc"], // invalid votes on a new member
      ],
      [voter(A, "10")],
      new Set(),
      7,
    );

    expect(result.nextEdited).toEqual({ [A.toLowerCase()]: "7" });
    expect(result.nextNew).toEqual([{ address: C.toLowerCase(), votes: "7" }]);
  });

  it("skips blank rows, invalid addresses, and addresses already onchain elsewhere", () => {
    const result = computeCsvSync(
      [
        ["", ""], // blank -> ignored, not skipped
        ["not-an-address", "5"], // invalid -> skipped
        [B, "5"], // valid but already onchain in another group -> skipped
        [C, "5"], // genuinely new
      ],
      [],
      new Set([B.toLowerCase()]),
      10,
    );

    expect(result.nextNew).toEqual([{ address: C.toLowerCase(), votes: "5" }]);
    expect(result.skipped).toBe(2);
  });
});

describe("buildCsvRows", () => {
  it("emits shown votes for kept members and appends staged new rows", () => {
    const voters = [voter(A, "10"), voter(B, "20")];
    const removed = new Set([B.toLowerCase()]);
    const shownVotes = (v: SubgraphVoter) =>
      v.account === A ? "15" : v.votingPower;
    const newRows: NewRow[] = [{ id: 1, address: C, votes: "30" }];

    expect(buildCsvRows(voters, removed, shownVotes, newRows)).toEqual([
      [A, "15"],
      [C, "30"],
    ]);
  });
});
