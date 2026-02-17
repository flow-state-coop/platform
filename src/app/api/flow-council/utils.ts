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
