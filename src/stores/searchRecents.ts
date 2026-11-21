/**
 * The last few things opened from global search (the web's
 * `useRecentSearches.ts`: 6, newest first, one entry per destination).
 * Per user on this phone, never sent anywhere. An unreadable value is an
 * empty list: recents are a convenience, never an error.
 */
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const MAX_RECENTS = 6;

export interface RecentHit {
  /** A record's `<kind>:<id>`, or `app:<key>` / `command:<id>`. */
  id: string;
  title: string;
  subtitle: string | null;
  /** A web path for a record; an app key or command id otherwise (see `id`). */
  to: string;
  at: number;
}

const keyFor = (userId: number) => `mm.search.recents.${userId}`;

/**
 * SafeZone kinds are never kept (their subtitles are secrets: review S2, 88).
 * A list stored before that rule is cleaned on load.
 */
const SECRET_KINDS = ["password:", "paymentCard:", "identity:"];
const isSecret = (r: RecentHit) => SECRET_KINDS.some((k) => r.id.startsWith(k));

function readable(value: string | null): RecentHit[] {
  try {
    const parsed: unknown = value ? JSON.parse(value) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is RecentHit => !!e && typeof e === "object" && typeof (e as RecentHit).id === "string" && typeof (e as RecentHit).title === "string" && typeof (e as RecentHit).to === "string");
  } catch {
    return [];
  }
}

export function useSearchRecents(userId: number | null) {
  const [recents, setRecents] = useState<RecentHit[]>([]);
  useEffect(() => {
    if (userId == null) return;
    let live = true;
    AsyncStorage.getItem(keyFor(userId))
      .then((v) => {
        if (!live) return;
        const stored = readable(v);
        const clean = stored.filter((r) => !isSecret(r));
        // A tap that landed before this read is kept, AND the stored list is
        // not overwritten by it (review S3): taps first, then the stored ones.
        setRecents((early) => {
          const merged = [...early, ...clean.filter((r) => !early.some((e) => e.id === r.id))].slice(0, MAX_RECENTS);
          if (early.length || clean.length !== stored.length) void AsyncStorage.setItem(keyFor(userId), JSON.stringify(merged)).catch(() => undefined);
          return merged;
        });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [userId]);

  const remember = useCallback(
    (hit: Omit<RecentHit, "at">) => {
      if (isSecret({ ...hit, at: 0 })) return;
      setRecents((prev) => {
        const next = [{ ...hit, at: Date.now() }, ...prev.filter((r) => r.id !== hit.id)].slice(0, MAX_RECENTS);
        if (userId != null) void AsyncStorage.setItem(keyFor(userId), JSON.stringify(next)).catch(() => undefined);
        return next;
      });
    },
    [userId],
  );

  const clear = useCallback(() => {
    setRecents([]);
    if (userId != null) void AsyncStorage.removeItem(keyFor(userId)).catch(() => undefined);
  }, [userId]);

  return { recents, remember, clear };
}
