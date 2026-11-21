/**
 * The contact just moved to the trash, for the list's Undo — the Calendar's
 * pattern (`calendarUndo.store.ts`): the delete happens on the detail page,
 * the Undo appears where the person lands. Not persisted.
 */
import { create } from "zustand";
import { onSessionEnd } from "@/lib/sessionEnd";

export interface TrashedContact {
  id: number;
  name: string;
  at: number;
}

interface UndoState {
  trashed: TrashedContact | null;
  set: (trashed: TrashedContact | null) => void;
}

export const useContactsUndo = create<UndoState>((set) => ({
  trashed: null,
  set: (trashed) => set({ trashed }),
}));

// The previous account's: sign-out takes it away (ee's review; SafeZone's lock does the same).
onSessionEnd(() => useContactsUndo.getState().set(null));
