import { vi } from "vitest";

export type ReadContractStub = {
  address: string;
  functionName: string;
  args?: readonly unknown[];
  returnValue: unknown;
};

export type MockPublicClient = {
  readContract: ReturnType<typeof vi.fn>;
};

export function mockPublicClient(stubs: ReadContractStub[]): MockPublicClient {
  const readContract = vi.fn(async (params: Record<string, unknown>) => {
    const rawAddress = String(params.address ?? "");
    const address = rawAddress.toLowerCase();
    const functionName = String(params.functionName ?? "");
    const args = (params.args as readonly unknown[] | undefined) ?? [];

    const match = stubs.find((stub) => {
      if (stub.address.toLowerCase() !== address) return false;
      if (stub.functionName !== functionName) return false;
      if (stub.args === undefined) return true;
      if (stub.args.length !== args.length) return false;
      return stub.args.every((expected, i) => {
        const actual = args[i];
        if (
          typeof expected === "string" &&
          typeof actual === "string" &&
          expected.startsWith("0x") &&
          actual.startsWith("0x")
        ) {
          return expected.toLowerCase() === actual.toLowerCase();
        }
        return expected === actual;
      });
    });

    if (!match) {
      throw new Error(
        `unmocked readContract call: address=${rawAddress} fn=${functionName} args=${JSON.stringify(args)}`,
      );
    }

    return match.returnValue;
  });

  return { readContract };
}
