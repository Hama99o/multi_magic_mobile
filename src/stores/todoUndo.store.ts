/**
 * The last Todo action that can be taken back (a deleted or ticked task), for
 * the Undo bar of the screen the person is on. UI state, not server data
 * (`docs/DATA_LAYER.md`): the undo itself is a mutation. Not persisted.
 */
import { create } from "zustand";
import type { UndoOffer } from "@/components/UndoToast";

interface TodoUndoState {
  offer: UndoOffer | null;
  offerUndo: (message: string, undo?: () => void) => void;
  clear: () => void;
}

export const useTodoUndo = create<TodoUndoState>((set) => ({
  offer: null,
  offerUndo: (message, undo) => set({ offer: { message, undo, at: Date.now() } }),
  clear: () => set({ offer: null }),
}));
