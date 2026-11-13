/**
 * The notes list layout (owner, 2026-11-13): Keep's 2-column grid by
 * default, a 1-column list as the secondary choice. The server has no such
 * setting, so it lives on this phone, per signed-in user.
 */
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type NotesLayout = "grid" | "list";
const key = (userId: number) => `mm-notes-layout:${userId}`;

interface NotesViewState {
  layout: NotesLayout;
  userId: number | null;
  hydrate: (userId: number) => Promise<void>;
  setLayout: (layout: NotesLayout) => void;
}

export const useNotesView = create<NotesViewState>((set, get) => ({
  layout: "grid",
  userId: null,
  hydrate: async (userId) => {
    set({ userId, layout: "grid" });
    try {
      const stored = await AsyncStorage.getItem(key(userId));
      if (get().userId === userId && (stored === "grid" || stored === "list")) set({ layout: stored });
    } catch {
      // the default stands
    }
  },
  setLayout: (layout) => {
    set({ layout });
    const userId = get().userId;
    if (userId !== null) void AsyncStorage.setItem(key(userId), layout).catch(() => undefined);
  },
}));
