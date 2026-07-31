import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next-auth", () => ({ default: () => () => undefined }));
vi.mock("next-auth/providers/credentials", () => ({ default: () => ({}) }));

import {
  allowedSiweDomains,
  isAllowedSiweDomain,
  readCsrfNonce,
} from "./[...nextauth]/route";
import { hasUsableExpiry, SIWE_MESSAGE_LIFETIME_MS } from "@/lib/siwe";

function cookieJar(jar: Record<string, string>) {
  return {
    get: (name: string) => (name in jar ? { value: jar[name] } : undefined),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("allowedSiweDomains", () => {
  it("always accepts the production host", () => {
    expect(allowedSiweDomains()).toContain("flowstate.network");
  });

  it("accepts the configured deployment URL's host", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://staging.example.org");

    expect(allowedSiweDomains()).toContain("staging.example.org");
  });

  it("accepts a preview's deployment URL and its branch alias", () => {
    vi.stubEnv("VERCEL_URL", "platform-abc123.vercel.app");
    vi.stubEnv("VERCEL_BRANCH_URL", "platform-git-feat-x.vercel.app");

    const hosts = allowedSiweDomains();

    expect(hosts).toContain("platform-abc123.vercel.app");
    expect(hosts).toContain("platform-git-feat-x.vercel.app");
  });

  it("accepts localhost outside production", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(allowedSiweDomains()).toContain("localhost:3000");
  });

  it("refuses localhost in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(allowedSiweDomains()).not.toContain("localhost:3000");
  });

  it("refuses a host it was not configured with", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(allowedSiweDomains()).not.toContain("example.com");
  });

  it("ignores a malformed NEXTAUTH_URL rather than throwing", () => {
    vi.stubEnv("NEXTAUTH_URL", "not a url");

    expect(() => allowedSiweDomains()).not.toThrow();
    expect(allowedSiweDomains()).toContain("flowstate.network");
  });

  it("accepts hosts named by SIWE_ALLOWED_DOMAINS", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SIWE_ALLOWED_DOMAINS", "app.example.org, alias.example.org");

    const hosts = allowedSiweDomains();

    expect(hosts).toContain("app.example.org");
    expect(hosts).toContain("alias.example.org");
  });
});

describe("isAllowedSiweDomain", () => {
  it("accepts a dev server on any port outside production", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(isAllowedSiweDomain("localhost:3001")).toBe(true);
    expect(isAllowedSiweDomain("192.168.1.24:3000")).toBe(true);
    expect(isAllowedSiweDomain("127.0.0.1:8080")).toBe(true);
  });

  it("refuses local hosts in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(isAllowedSiweDomain("localhost:3001")).toBe(false);
    expect(isAllowedSiweDomain("192.168.1.24:3000")).toBe(false);
  });

  it("refuses a public host that only looks local", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(isAllowedSiweDomain("localhost.attacker.com")).toBe(false);
    expect(isAllowedSiweDomain("evil.com")).toBe(false);
  });

  // The right shape is not an address. Both of these matched while the pattern
  // was doing its own arithmetic.
  it("refuses an out-of-range octet or port", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(isAllowedSiweDomain("192.168.999.999")).toBe(false);
    expect(isAllowedSiweDomain("127.0.0.256:3000")).toBe(false);
    expect(isAllowedSiweDomain("127.0.0.1:99999")).toBe(false);
    expect(isAllowedSiweDomain("127.0.0.1:65535")).toBe(true);
  });

  // Public ranges that the shape alone does not separate from a LAN address.
  it("refuses a routable address that is not on a private range", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(isAllowedSiweDomain("8.8.8.8:3000")).toBe(false);
    expect(isAllowedSiweDomain("172.15.0.1:3000")).toBe(false);
    expect(isAllowedSiweDomain("172.32.0.1:3000")).toBe(false);
    expect(isAllowedSiweDomain("172.16.0.1:3000")).toBe(true);
  });
});

describe("readCsrfNonce", () => {
  it("reads the __Host- prefixed cookie every HTTPS deployment gets", () => {
    const nonce = readCsrfNonce(
      cookieJar({ "__Host-next-auth.csrf-token": "abc123|hash" }),
    );

    expect(nonce).toBe("abc123");
  });

  it("reads the unprefixed cookie a plain-http dev server gets", () => {
    const nonce = readCsrfNonce(
      cookieJar({ "next-auth.csrf-token": "def456|hash" }),
    );

    expect(nonce).toBe("def456");
  });

  it("prefers the prefixed cookie when both are present", () => {
    const nonce = readCsrfNonce(
      cookieJar({
        "__Host-next-auth.csrf-token": "secure|hash",
        "next-auth.csrf-token": "stale|hash",
      }),
    );

    expect(nonce).toBe("secure");
  });

  it("returns null rather than a nonce viem would skip checking", () => {
    expect(readCsrfNonce(cookieJar({}))).toBeNull();
    expect(
      readCsrfNonce(cookieJar({ "next-auth.csrf-token": "|hash" })),
    ).toBeNull();
  });
});

describe("hasUsableExpiry", () => {
  const now = new Date("2026-07-29T12:00:00Z");

  it("accepts the lifetime the sign-in hook mints", () => {
    const expirationTime = new Date(now.getTime() + SIWE_MESSAGE_LIFETIME_MS);

    expect(hasUsableExpiry(expirationTime, now)).toBe(true);
  });

  it("refuses a message with no expiry, which never expires", () => {
    expect(hasUsableExpiry(undefined, now)).toBe(false);
  });

  it("refuses an expiry that has already passed", () => {
    expect(hasUsableExpiry(new Date(now.getTime() - 1000), now)).toBe(false);
  });

  it("refuses an expiry far enough out to be decorative", () => {
    const expirationTime = new Date(now.getTime() + 24 * 60 * 60_000);

    expect(hasUsableExpiry(expirationTime, now)).toBe(false);
  });
});
