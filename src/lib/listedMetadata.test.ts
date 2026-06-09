import { describe, expect, it } from "vitest";
import { parseListed, serializeListed } from "./listedMetadata";

// Spec: "missing/non-true = unlisted" contract
// Spec: "The flag is always written as a JSON object with listed:true (listed) or
//        listed:false (unlisted). A round reads as Unlisted whenever the `listed`
//        field is absent or not `true`"
// Spec: "serialization must stay canonical (stable key, no incidental whitespace)"

describe("parseListed", () => {
  describe("returns true only for JSON with listed === true (boolean)", () => {
    it('returns true for {"listed":true}', () => {
      expect(parseListed('{"listed":true}')).toBe(true);
    });

    it("returns true for JSON with listed:true alongside other keys", () => {
      expect(parseListed('{"listed":true,"other":"value"}')).toBe(true);
    });

    it("returns true for JSON with whitespace around listed:true", () => {
      expect(parseListed('{ "listed": true }')).toBe(true);
    });
  });

  describe("returns false for listed:false", () => {
    it('returns false for {"listed":false}', () => {
      expect(parseListed('{"listed":false}')).toBe(false);
    });
  });

  describe("returns false for absent/missing listed key", () => {
    it("returns false for empty JSON object", () => {
      expect(parseListed("{}")).toBe(false);
    });

    it("returns false for JSON missing the listed key", () => {
      expect(parseListed('{"name":"test","description":"foo"}')).toBe(false);
    });
  });

  describe("returns false for non-boolean listed values (strict equality)", () => {
    it('returns false for listed:"true" (string, not boolean)', () => {
      expect(parseListed('{"listed":"true"}')).toBe(false);
    });

    it("returns false for listed:1 (number, not boolean)", () => {
      expect(parseListed('{"listed":1}')).toBe(false);
    });

    it("returns false for listed:null", () => {
      expect(parseListed('{"listed":null}')).toBe(false);
    });

    it('returns false for listed:"false"', () => {
      expect(parseListed('{"listed":"false"}')).toBe(false);
    });
  });

  describe("returns false for malformed / non-JSON input", () => {
    it("returns false for empty string", () => {
      expect(parseListed("")).toBe(false);
    });

    it("returns false for null", () => {
      expect(parseListed(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(parseListed(undefined)).toBe(false);
    });

    it("returns false for legacy free-form text (e.g. 'Test Dev Rewards')", () => {
      expect(parseListed("Test Dev Rewards")).toBe(false);
    });

    it("returns false for another legacy free-form text value", () => {
      expect(parseListed("ai16z Continuous Funding")).toBe(false);
    });

    it("returns false for partial JSON", () => {
      expect(parseListed('{"listed":tru')).toBe(false);
    });

    it("returns false for a bare JSON string (not an object)", () => {
      expect(parseListed('"listed"')).toBe(false);
    });

    it("returns false for a JSON array", () => {
      expect(parseListed("[true]")).toBe(false);
    });

    it("returns false for a JSON number", () => {
      expect(parseListed("1")).toBe(false);
    });
  });
});

describe("serializeListed", () => {
  // Spec: "canonical (stable key, no incidental whitespace)" so the future
  // subgraph `metadata_contains: '"listed":true'` substring filter matches.

  it('serializes true as the exact string {"listed":true}', () => {
    expect(serializeListed(true)).toBe('{"listed":true}');
  });

  it('serializes false as the exact string {"listed":false}', () => {
    expect(serializeListed(false)).toBe('{"listed":false}');
  });

  it("produces no whitespace in the output for true", () => {
    const result = serializeListed(true);
    expect(result).not.toMatch(/\s/);
  });

  it("produces no whitespace in the output for false", () => {
    const result = serializeListed(false);
    expect(result).not.toMatch(/\s/);
  });

  it("listed:true output contains the substring '\"listed\":true'", () => {
    // Confirms the future subgraph metadata_contains filter will match
    expect(serializeListed(true)).toContain('"listed":true');
  });

  it("serializeListed(true) is parseable back to true via parseListed (round-trip)", () => {
    expect(parseListed(serializeListed(true))).toBe(true);
  });

  it("serializeListed(false) is parseable back to false via parseListed (round-trip)", () => {
    expect(parseListed(serializeListed(false))).toBe(false);
  });
});
