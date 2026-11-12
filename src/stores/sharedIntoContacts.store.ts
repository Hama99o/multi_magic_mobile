/**
 * What another app just shared into Contacts, waiting for the screen it was
 * routed to (`ShareIntentBridge` → `/contacts/edit?shared=1`,
 * `/contacts/import?shared=1`, `/contacts/shared`). Taken once, then cleared:
 * a second visit to the form must not be filled with an old share.
 */
import { create } from "zustand";
import type { ParsedCard } from "@/screens/contacts/shareIn";

export type SharedIntoContacts =
  | { kind: "card"; card: ParsedCard }
  | { kind: "cards"; cards: string[] }
  | { kind: "bits"; text: string; phones: string[]; emails: string[] };

interface State {
  pending: SharedIntoContacts | null;
  set: (pending: SharedIntoContacts | null) => void;
  take: () => SharedIntoContacts | null;
}

export const useSharedIntoContacts = create<State>((set, get) => ({
  pending: null,
  set: (pending) => set({ pending }),
  take: () => {
    const pending = get().pending;
    set({ pending: null });
    return pending;
  },
}));
