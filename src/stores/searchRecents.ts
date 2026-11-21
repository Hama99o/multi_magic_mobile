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
      .then((v) => live && setRecents(readable(v)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [userId]);

  const remember = useCallback(
    (hit: Omit<RecentHit, "at">) => {
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
