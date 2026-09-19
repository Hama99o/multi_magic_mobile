/**
 * ENGLISH OR FRENCH — the same choice the web saves, on the same field.
 *
 * His words: *"same lang as we have in web, both mode."* The web's switcher
 * writes `PATCH /api/v1/users/:id { user: { lang } }` and applies
 * `currentUser.lang` on sign-in (`AuthContext.tsx:12-23`). So this store does
 * three things, in this order of authority:
 *
 *   1. what he chose ON THIS PHONE (AsyncStorage) — because a phone he has
 *      switched should stay switched even while the profile request is in
 *      flight, or offline, or if it fails;
 *   2. what the SERVER has for him, applied once the profile lands — so
 *      switching on the laptop reaches the phone;
 *   3. English, the app's own default (`BRIEF.md` §4).
 *
 * ── Why the OS locale is deliberately not consulted ───────────────────────
 * The web uses a browser language detector. The phone equivalent would be the
 * device locale, and it is the wrong default here: this interface is English
 * by decision while his CORPUS is largely French, so a French phone would
 * flip the whole app on somebody who never asked for it. The first launch is
 * English until he says otherwise, and then his choice is remembered for ever.
 *
 * ── The write is fire-and-forget, and that is the honest trade ────────────
 * The language is already applied locally when the request goes out. A failed
 * write costs the OTHER clients not knowing, which is recoverable by
 * switching again; blocking the UI on a round trip to change a label is not.
 */
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n, { DEFAULT_LANGUAGE, isLanguage, type LanguageCode } from "@/i18n";
import { profileApi } from "@/api/profile";

const KEY = "mm-language";

interface LanguageState {
  language: LanguageCode;
  /** False until storage has answered — the root layout waits on this. */
  hydrated: boolean;
  /** True once this phone has a choice of its own, which outranks the server. */
  chosenHere: boolean;
  setLanguage: (language: LanguageCode, userId?: number | null) => void;
  hydrate: () => Promise<void>;
  /** The server's answer, applied only if this phone has not chosen. */
  applyFromServer: (language: string | null) => void;
}

function apply(language: LanguageCode): void {
  if (i18n.language !== language) void i18n.changeLanguage(language);
}

export const useLanguage = create<LanguageState>((set, get) => ({
  language: DEFAULT_LANGUAGE,
  hydrated: false,
  chosenHere: false,

  setLanguage: (language, userId) => {
    set({ language, chosenHere: true });
    apply(language);
    void AsyncStorage.setItem(KEY, language).catch(() => {});
    // The same field the web writes, so the two stay in step. Fire and
    // forget — see the header.
    if (userId != null) {
      void profileApi.update(userId, { lang: language }).catch(() => {});
    }
  },

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(KEY);
      if (isLanguage(stored)) {
        set({ language: stored, chosenHere: true });
        apply(stored);
      }
    } catch {
      // English is the right fallback: it is what the app did before anybody
      // chose, and it is never wrong, only unopinionated.
    } finally {
      set({ hydrated: true });
    }
  },

  applyFromServer: (language) => {
    // A choice made on THIS phone wins. Otherwise the web's choice arrives
    // here, which is the whole point of storing it on the user.
    if (get().chosenHere || !isLanguage(language)) return;
    set({ language });
    apply(language);
  },
}));

/** Test seam: back to the launch state. */
export function __resetLanguage(): void {
  useLanguage.setState({ language: DEFAULT_LANGUAGE, hydrated: false, chosenHere: false });
  apply(DEFAULT_LANGUAGE);
}
