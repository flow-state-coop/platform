import { describe, it, expect } from "vitest";
import {
  computeCsvSync,
  buildCsvRows,
  validateCsvShape,
  isEnsName,
  collectEnsNames,
  applyEnsResolutions,
} from "./voterCsv";
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
    // Only the malformed address counts as a formatting issue; the already-onchain
    // row is a benign skip.
    expect(result.invalidRows).toBe(1);
  });

  it("accepts well-formed addresses regardless of EIP-55 checksum casing", () => {
    const nonChecksummed = "0x388C818CA8B9251B393131C08A736A67CCB19297";

    const result = computeCsvSync([[nonChecksummed, "5"]], [], new Set(), 10);

    expect(result.nextNew).toEqual([
      { address: nonChecksummed.toLowerCase(), votes: "5" },
    ]);
    expect(result.skipped).toBe(0);
  });

  it("skips a mixed-case address whose checksum fails (a likely typo)", () => {
    // 0xC02aaA…Cc2 (WETH) is a valid checksum; the trailing 2 -> 3 breaks it.
    const typo = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc3";

    const result = computeCsvSync([[typo, "5"]], [], new Set(), 10);

    expect(result.nextNew).toEqual([]);
    expect(result.skipped).toBe(1);
    expect(result.invalidRows).toBe(1);
  });
});

describe("validateCsvShape", () => {
  it("accepts a template file (address in the first column)", () => {
    expect(
      validateCsvShape([
        [A, "10"],
        [B, "5"],
      ]),
    ).toBeNull();
  });

  it("accepts a template file with a header row", () => {
    expect(
      validateCsvShape([
        ["address", "votes"],
        [A, "10"],
      ]),
    ).toBeNull();
  });

  it("accepts addresses with no votes column", () => {
    expect(validateCsvShape([[A], [B]])).toBeNull();
  });

  it("rejects a roster with the address in the wrong column", () => {
    const error = validateCsvShape([
      ["Mentor", "Wallet Address", "Email"],
      ["Solène Daviaud", A, "solene@example.com"],
      ["Pedro Talent", "pcbo.eth", "pedro@example.com"],
    ]);

    expect(error).toMatch(/first column/i);
  });

  it("rejects an empty file", () => {
    expect(validateCsvShape([["", ""], [""]])).toMatch(/empty/i);
  });

  it("rejects a file whose only address has a bad checksum", () => {
    const badChecksum = "0xE247a45c287191d435A8a5D72A7C8dc030F1dB18";

    expect(validateCsvShape([[badChecksum, "10"]])).toMatch(/first column/i);
  });

  it("accepts a file once its ENS names are resolved to addresses", () => {
    const rows = applyEnsResolutions([["tnrdd.eth", "10"]], { "tnrdd.eth": A });

    expect(validateCsvShape(rows)).toBeNull();
  });
});

describe("ENS helpers", () => {
  it("flags dotted names but not addresses, emails, or spaced text", () => {
    expect(isEnsName("tnrdd.eth")).toBe(true);
    expect(isEnsName("pcbo.eth")).toBe(true);
    expect(isEnsName(A)).toBe(false);
    expect(isEnsName("solene@example.com")).toBe(false);
    expect(isEnsName("Pedro Talent")).toBe(false);
    expect(isEnsName("")).toBe(false);
  });

  it("ignores dotted names outside .eth so they fail the shape check instead", () => {
    expect(isEnsName("j.smith")).toBe(false);
    expect(isEnsName("coinbase.com")).toBe(false);
    expect(isEnsName("flowstate.network")).toBe(false);
    expect(isEnsName("sub.tnrdd.eth")).toBe(true);
  });

  it("collects ENS names only from the address column", () => {
    const names = collectEnsNames([
      ["tnrdd.eth", "10"],
      [A, "10"], // already an address
      ["Some Name", "pcbo.eth"], // ENS in the wrong column is ignored
    ]);

    expect(names).toEqual(["tnrdd.eth"]);
  });

  it("substitutes resolved names into the address column, leaving the rest", () => {
    const rows = applyEnsResolutions(
      [
        ["tnrdd.eth", "10"],
        [B, "5"],
      ],
      { "tnrdd.eth": A },
    );

    expect(rows).toEqual([
      [A, "10"],
      [B, "5"],
    ]);
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
