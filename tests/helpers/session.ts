import { vi } from "vitest";
import { getServerSession } from "next-auth/next";

// Callers must put `vi.mock("next-auth/next")` and
// `vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))`
// at the top of their test file. These calls are hoisted; helpers can then
// configure the mock's return value per-test.

export function mockSession(address: string) {
  vi.mocked(getServerSession).mockResolvedValue({
    address,
    user: { name: address, image: "" },
    // Minimal session shape — cast because the app extends Session with
    // an address field not present in the base type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

export function mockUnauthenticated() {
  vi.mocked(getServerSession).mockResolvedValue(null);
}
