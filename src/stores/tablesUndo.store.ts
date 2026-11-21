/**
 * The last Tables action that can be taken back (a deleted row), for the
 * Undo bar of the table screen the person lands on. UI state, not server data
 * (`docs/DATA_LAYER.md`): the undo itself is a request. Not persisted.
 */
import { create } from "zustand";
import type { UndoOffer } from "@/components/UndoToast";

interface TablesUndoState {
  offer: UndoOffer | null;
  offerUndo: (message: string, undo?: () => void) => void;
  clear: () => void;
}

export const useTablesUndo = create<TablesUndoState>((set) => ({
  offer: null,
  offerUndo: (message, undo) => set({ offer: { message, undo, at: Date.now() } }),
  clear: () => set({ offer: null }),
}));
