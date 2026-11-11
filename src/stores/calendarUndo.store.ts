/**
 * The event just moved to the trash, for the list's Undo.
 *
 * The delete happens on the detail page, which then closes; the Undo has to
 * appear on the screen the person lands on. Not persisted: an Undo that
 * survives a restart is a surprise, not a safety net.
 */
import { create } from "zustand";

export interface Trashed {
  id: number;
  title: string;
  at: number;
}

interface UndoState {
  trashed: Trashed | null;
  set: (trashed: Trashed | null) => void;
}

export const useCalendarUndo = create<UndoState>((set) => ({
  trashed: null,
  set: (trashed) => set({ trashed }),
}));
