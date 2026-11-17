/**
 * THE LAST APP, KEPT ON THIS PHONE (CLAUDE.md, "Reopening the app").
 *
 * Read once before the first screen (app/_layout.tsx, with the theme and the
 * language), written by `PlaceRecorder` as the person moves between apps, and
 * cleared on sign-out or when another account signs in. Storage that cannot
 * be read is no place, never a crash: the app then opens Home, which is the
 * first-launch screen anyway.
 */
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { parsePlace, type Place, type PlaceDraft } from "@/apps/lastPlace";
import { useAuthStore } from "@/stores/auth.store";

export const LAST_PLACE_KEY = "mm-last-place";

interface LastPlaceState {
  place: Place | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  record: (draft: PlaceDraft, userId: number | null) => Promise<void>;
  clear: () => Promise<void>;
}

const same = (a: Place | null, b: Place) => a != null && JSON.stringify(a) === JSON.stringify(b);

export const useLastPlace = create<LastPlaceState>((set, get) => ({
  place: null,
  hydrated: false,
  hydrate: async () => {
    try {
      set({ place: parsePlace(await AsyncStorage.getItem(LAST_PLACE_KEY)), hydrated: true });
    } catch {
      set({ place: null, hydrated: true });
    }
  },
  record: async (draft, userId) => {
    const place: Place = { v: 2, ...draft, userId: userId ?? get().place?.userId ?? null };
    if (same(get().place, place)) return;
    set({ place });
    await AsyncStorage.setItem(LAST_PLACE_KEY, JSON.stringify(place)).catch(() => undefined);
  },
  clear: async () => {
    set({ place: null });
    await AsyncStorage.removeItem(LAST_PLACE_KEY).catch(() => undefined);
  },
}));

// Signing out forgets the place; so does another account signing in.
useAuthStore.subscribe((state, previous) => {
  if (state.status === "signedOut" && previous.status === "signedIn") {
    void useLastPlace.getState().clear();
    return;
  }
  const saved = useLastPlace.getState().place;
  const id = state.status === "signedIn" ? state.user?.id : undefined;
  if (id != null && saved?.userId != null && saved.userId !== id) void useLastPlace.getState().clear();
});
