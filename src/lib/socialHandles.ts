const SOCIAL_BASE_URLS: Record<string, string> = {
  twitter: "https://x.com",
  github: "https://github.com",
  linkedin: "https://linkedin.com/in",
  farcaster: "https://farcaster.xyz",
  telegram: "https://t.me",
};

const SOCIAL_ALLOWED_HOSTS: Record<string, string[]> = {
  twitter: ["x.com", "twitter.com"],
  github: ["github.com"],
  linkedin: ["linkedin.com"],
  farcaster: ["warpcast.com", "farcaster.xyz"],
  telegram: ["t.me"],
};

export function normalizeSocialHandle(
  raw: string,
  platform: keyof typeof SOCIAL_BASE_URLS,
): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return "";
      }
      const host = url.hostname.replace(/^www\./, "");
      const allowed = SOCIAL_ALLOWED_HOSTS[platform] ?? [];
      if (allowed.includes(host)) {
        // Strip query and hash — they can carry tracking params or
        // open-redirect chains and we only need the canonical profile path.
        return `https://${host}${url.pathname}`;
      }
      // Not an allowed host — fall through to treat the last path segment as a handle
      const lastSegment = url.pathname.split("/").filter(Boolean).pop();
      if (!lastSegment) return "";
      const handle = lastSegment.replace(/^@/, "");
      return `${SOCIAL_BASE_URLS[platform]}/${encodeURIComponent(handle)}`;
    } catch {
      return "";
    }
  }

  const handle = trimmed.replace(/^@/, "");
  return `${SOCIAL_BASE_URLS[platform]}/${encodeURIComponent(handle)}`;
}

export function extractSocialHandle(
  raw: string,
  platform: "twitter" | "farcaster",
): string {
  const trimmed = raw.trim();
  // Scheme-less profile-URL pastes (e.g. "x.com/alice") would otherwise be
  // treated as bare handles.
  const candidate =
    trimmed.includes("/") && !/^https?:\/\//i.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;
  const normalized = normalizeSocialHandle(candidate, platform);
  if (!normalized) return "";

  try {
    const lastSegment = new URL(normalized).pathname
      .split("/")
      .filter(Boolean)
      .pop();
    const handle = lastSegment
      ? decodeURIComponent(lastSegment).replace(/^@/, "")
      : "";
    return /[\s/]/.test(handle) ? "" : handle;
  } catch {
    return "";
  }
}
