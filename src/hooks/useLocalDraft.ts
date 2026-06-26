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

type Options = {
  debounceMs?: number;
};

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
      return raw ? (JSON.parse(raw) as T) : null;
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
          window.localStorage.setItem(target, JSON.stringify(value));
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
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useMemo(
    () => ({ readDraft, save, clear }),
    [readDraft, save, clear],
  );
}
