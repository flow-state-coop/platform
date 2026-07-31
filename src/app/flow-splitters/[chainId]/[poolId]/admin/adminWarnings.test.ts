import { describe, it, expect } from "vitest";
import { FLOW_STATE_BOT_ADDRESS } from "@/app/flow-councils/lib/constants";
import { isRemovingBotAdmin, getConfirmWarnings } from "./adminWarnings";

const BOT = FLOW_STATE_BOT_ADDRESS.toLowerCase();
const HUMAN = "0x1111111111111111111111111111111111111111";

const entry = (address: string, validationError = "") => ({
  address,
  validationError,
});

describe("isRemovingBotAdmin", () => {
  it("is true when the bot holds admin and its row is gone", () => {
    expect(
      isRemovingBotAdmin({
        indexedAdmins: [HUMAN, BOT],
        adminsEntry: [entry(HUMAN)],
        immutable: false,
      }),
    ).toBe(true);
  });

  it("is false while the bot's row is still listed", () => {
    expect(
      isRemovingBotAdmin({
        indexedAdmins: [HUMAN, BOT],
        adminsEntry: [entry(HUMAN), entry(BOT)],
        immutable: false,
      }),
    ).toBe(false);
  });

  // The subgraph lowercases; a hand-typed address does not.
  it("matches the bot regardless of case", () => {
    expect(
      isRemovingBotAdmin({
        indexedAdmins: [FLOW_STATE_BOT_ADDRESS],
        adminsEntry: [entry(FLOW_STATE_BOT_ADDRESS.toUpperCase())],
        immutable: false,
      }),
    ).toBe(false);
  });

  // An invalid row cannot be submitted, so it cannot be what keeps the bot in.
  it("ignores a row that fails validation", () => {
    expect(
      isRemovingBotAdmin({
        indexedAdmins: [BOT],
        adminsEntry: [entry(BOT, "Invalid Address")],
        immutable: false,
      }),
    ).toBe(true);
  });

  it("is false when the bot never held admin", () => {
    expect(
      isRemovingBotAdmin({
        indexedAdmins: [HUMAN],
        adminsEntry: [entry(HUMAN)],
        immutable: false,
      }),
    ).toBe(false);
  });

  it("defers to the immutable warning rather than doubling up", () => {
    expect(
      isRemovingBotAdmin({
        indexedAdmins: [BOT],
        adminsEntry: [],
        immutable: true,
      }),
    ).toBe(false);
  });
});

describe("getConfirmWarnings", () => {
  it("returns nothing for an ordinary save", () => {
    expect(
      getConfirmWarnings({
        immutable: false,
        botIsAdmin: false,
        hasActiveKeys: false,
        removingBotAdmin: false,
      }),
    ).toEqual([]);
  });

  it("warns about a permanent loss of API writes when the bot holds admin", () => {
    const warnings = getConfirmWarnings({
      immutable: true,
      botIsAdmin: true,
      hasActiveKeys: false,
      removingBotAdmin: false,
    });

    expect(warnings[0]).toContain("stop permanently");
  });

  // The gate must not go quiet just because a read has not landed: the save
  // path re-reads the same fact and would revoke the bot.
  it("warns when the bot's status is unresolved", () => {
    const warnings = getConfirmWarnings({
      immutable: true,
      botIsAdmin: undefined,
      hasActiveKeys: false,
      removingBotAdmin: false,
    });

    expect(warnings[0]).toContain("Flow State bot");
  });

  it("falls back to the keys warning when the bot definitively has no admin", () => {
    const warnings = getConfirmWarnings({
      immutable: true,
      botIsAdmin: false,
      hasActiveKeys: true,
      removingBotAdmin: false,
    });

    expect(warnings[0]).toContain("Any API keys on this pool");
  });

  it("warns on an unresolved key status too", () => {
    const warnings = getConfirmWarnings({
      immutable: true,
      botIsAdmin: false,
      hasActiveKeys: undefined,
      removingBotAdmin: false,
    });

    expect(warnings[0]).toContain("Any API keys on this pool");
  });

  // A pool with nothing at stake gets no confirm at all, so the warnings that
  // do appear stay worth reading.
  it("says nothing about the API on an immutable save with no bot and no keys", () => {
    expect(
      getConfirmWarnings({
        immutable: true,
        botIsAdmin: false,
        hasActiveKeys: false,
        removingBotAdmin: false,
      }),
    ).toEqual([]);
  });

  it("warns only about the bot on an ordinary admin edit", () => {
    const warnings = getConfirmWarnings({
      immutable: false,
      botIsAdmin: true,
      hasActiveKeys: true,
      removingBotAdmin: true,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("removes the Flow State bot");
  });
});
