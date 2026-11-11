/**
 * Agenda or month — the last choice, kept on this device (SPEC §C.1).
 *
 * Agenda until told otherwise: "what is next" is the owner's own first
 * question of a phone calendar, and the web's phone default. A choice that
 * fails to load is simply the default; it is a convenience, not data.
 */
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type CalendarView = "agenda" | "month";
const KEY = "mm-calendar-view";

interface ViewState {
  view: CalendarView;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setView: (view: CalendarView) => void;
}

export const useCalendarView = create<ViewState>((set, get) => ({
  view: "agenda",
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const stored = await AsyncStorage.getItem(KEY);
      // A choice made while storage was answering wins over what it said.
      if (!get().hydrated) set({ view: stored === "month" ? "month" : "agenda", hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  setView: (view) => {
    set({ view, hydrated: true });
    void AsyncStorage.setItem(KEY, view).catch(() => undefined);
  },
}));
