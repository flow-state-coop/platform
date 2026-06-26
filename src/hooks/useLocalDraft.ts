import { useCallback, useEffect, useMemo, useRef } from "react";

// Lightweight, SSR-safe localStorage draft persistence: keep a serializable
// value (a form snapshot, a comment body) in the browser between explicit
// server saves so unsaved input survives a refresh or accidental navigation.
//
// The hook owns no state. Consumers read the stored draft once (readDraft) to
// seed their own state, call save() on every change (debounced), and clear()
// once the value has been persisted server-side. Pass key=null to disable
// (e.g. when the identifiers needed to build a stable key aren't known yet).

const KEY_PREFIX = "fc-draft:";
// Drafts untouched for this long are pruned on load so abandoned entries don't
// accumulate in localStorage indefinitely.
const TTL_MS = 1000 * 60 * 60 * 24 * 30;

type Options = {
  debounceMs?: number;
};

let sweptStaleDrafts = false;

function sweepStaleDrafts() {
  if (sweptStaleDrafts || typeof window === "undefined") return;
  sweptStaleDrafts = true;
  try {
    const now = Date.now();
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(KEY_PREFIX)) continue;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(k) ?? "null");
        if (parsed && typeof parsed.t === "number" && now - parsed.t > TTL_MS) {
          stale.push(k);
        }
      } catch {
        // Leave unparseable entries untouched.
      }
    }
    stale.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Ignore.
  }
}

export function useLocalDraft<T>(key: string | null, options: Options = {}) {
  const { debounceMs = 600 } = options;

  const storageKey = key ? `${KEY_PREFIX}${key}` : null;
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readDraft = useCallback((): T | null => {
    if (typeof window === "undefined" || !storageKey) return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && "v" in parsed && "t" in parsed
        ? (parsed.v as T)
        : (parsed as T);
    } catch {
      return null;
    }
  }, [storageKey]);

  const save = useCallback(
    (value: T) => {
      if (typeof window === "undefined") return;
      const target = storageKeyRef.current;
      if (!target) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        try {
          window.localStorage.setItem(
            target,
            JSON.stringify({ v: value, t: Date.now() }),
          );
        } catch {
          // Ignore quota or serialization failures; a lost draft is recoverable.
        }
      }, debounceMs);
    },
    [debounceMs],
  );

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (typeof window === "undefined") return;
    const target = storageKeyRef.current;
    if (!target) return;
    try {
      window.localStorage.removeItem(target);
    } catch {
      // Ignore.
    }
  }, []);

  useEffect(() => {
    sweepStaleDrafts();
  }, []);

  // Cancel any pending write when the key changes (or on unmount) so a debounced
  // save scheduled for the previous draft never lands after the consumer has
  // switched to a different one.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [storageKey]);

  return useMemo(
    () => ({ readDraft, save, clear }),
    [readDraft, save, clear],
  );
}
