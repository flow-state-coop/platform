export type ProjectMetadata = {
  name: string;
  logoUrl: string | null;
};

export function parseDetails<T>(raw: unknown): T | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return raw as T;
}

// Extracts a stored application's round/attestation section for the milestone
// ratchet, tolerating malformed details (returns undefined instead of
// throwing).
export function getStoredSection(
  details: unknown,
  key: "round" | "attestation",
): Record<string, unknown> | undefined {
  const parsed = parseDetails<Record<string, unknown>>(details);
  const section = parsed?.[key];
  return section && typeof section === "object" && !Array.isArray(section)
    ? (section as Record<string, unknown>)
    : undefined;
}
