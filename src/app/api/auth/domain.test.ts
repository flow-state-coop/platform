import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next-auth", () => ({ default: () => () => undefined }));
vi.mock("next-auth/providers/credentials", () => ({ default: () => ({}) }));

import { allowedSiweDomains, isAllowedSiweDomain } from "./[...nextauth]/route";

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
});
