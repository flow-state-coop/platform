import { describe, it, expect } from "vitest";
import { parseFlowUpdatedSenders } from "./senders";

const topic = (address: string) =>
  `0x${address.replace(/^0x/, "").toLowerCase().padStart(64, "0")}`;

describe("parseFlowUpdatedSenders", () => {
  it("collects each sender once, lowercased, ignoring malformed topics", () => {
    const logs = [
      {
        topics: [
          "0xsig",
          topic("0xtoken"),
          topic("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
          topic("0xsplitter"),
        ],
      },
      {
        topics: [
          "0xsig",
          topic("0xtoken"),
          topic("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
          topic("0xsplitter"),
        ],
      },
      {
        topics: [
          "0xsig",
          topic("0xtoken"),
          topic("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
          topic("0xsplitter"),
        ],
      },
      { topics: ["0xsig", topic("0xtoken"), null, topic("0xsplitter")] },
      { topics: ["0xsig", topic("0xtoken"), "0x1234"] },
    ];

    expect(parseFlowUpdatedSenders(logs)).toEqual([
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ]);
  });
});
