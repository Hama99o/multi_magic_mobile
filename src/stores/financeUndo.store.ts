/**
 * The last Finance action that can be taken back (a deleted expense, income or loan), for
 * the Undo bar of the screen the person is on. UI state, not server data
 * (`docs/DATA_LAYER.md`): the undo itself is a mutation. Not persisted.
 */
import { create } from "zustand";
import type { UndoOffer } from "@/components/UndoToast";
import { onSessionEnd } from "@/lib/sessionEnd";

interface FinanceUndoState {
  offer: UndoOffer | null;
  offerUndo: (message: string, undo?: () => void) => void;
  clear: () => void;
}

export const useFinanceUndo = create<FinanceUndoState>((set) => ({
  offer: null,
  offerUndo: (message, undo) => set({ offer: { message, undo, at: Date.now() } }),
  clear: () => set({ offer: null }),
}));

// An Undo is the previous account's: sign-out takes it away (ee's review).
onSessionEnd(() => useFinanceUndo.getState().clear());
