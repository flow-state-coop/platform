import { vi } from "vitest";
import { getServerSession } from "next-auth/next";
import type { Session } from "next-auth";

// Callers must put `vi.mock("next-auth/next")` and
// `vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))`
// at the top of their test file. These calls are hoisted; helpers can then
// configure the mock's return value per-test.

export function mockSession(address: string) {
  const session: Session = {
    address,
    user: { name: address, image: "" },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
  vi.mocked(getServerSession).mockResolvedValue(session);
}

export function mockUnauthenticated() {
  vi.mocked(getServerSession).mockResolvedValue(null);
}
