/**
 * Hands a rich-text field to the editor screen and its result back (memory
 * only, one at a time). A route param cannot carry a whole HTML document, and
 * the result has to reach the form that opened it (owner, 2026-11-15: a
 * contact's notes are edited on the phone, never "on the web").
 */
import { create } from "zustand";

export interface RichTextSession {
  html: string;
  title: string;
  onDone: (html: string) => void;
}

interface State {
  session: RichTextSession | null;
  start: (s: RichTextSession) => void;
  clear: () => void;
}

export const useRichTextSession = create<State>((set) => ({
  session: null,
  start: (session) => set({ session }),
  clear: () => set({ session: null }),
}));
