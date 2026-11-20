/**
 * ENGLISH OR FRENCH — the same choice the web saves, on the same field.
 *
 * His words: *"same lang as we have in web, both mode."* The web's switcher
 * writes `PATCH /api/v1/users/:id { user: { lang } }` and applies
 * `currentUser.lang` on sign-in (`AuthContext.tsx:12-23`). So this store does
 * three things, in this order of authority:
 *
 *   1. a choice made ON THIS PHONE that the server has NOT CONFIRMED yet
 *      (AsyncStorage, `mm-language-pending`): a phone just switched stays
 *      switched while the request is in flight, offline, or if it failed;
 *   2. what the SERVER has for him (`users.lang`), applied whenever the
 *      profile lands and saved here: a switch on the laptop reaches the phone
 *      even if the phone once chose for itself;
 *   3. English, the app's own default (`BRIEF.md` §4).
 *
 * Until 2026-11-20 rule 1 was "any choice ever made on this phone", so a
 * phone that had chosen once ignored the laptop for good. A device pass saw
 * it, and Hello (for the owner) ruled it a bug: the language lives in
 * users.lang, and the server wins once the phone's own choice is confirmed.
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

const KEY = "mm-language";
/** "1" while this phone's last choice has not been confirmed by the server. */
const PENDING_KEY = "mm-language-pending";

interface LanguageState {
  language: LanguageCode;
  /** False until storage has answered — the root layout waits on this. */
  hydrated: boolean;
  /** True while this phone's choice is not yet confirmed by the server: it outranks the server. */
  chosenHere: boolean;
  /** This phone's choice only; telling the server is `useChooseLanguage`. */
  setLanguage: (language: LanguageCode) => void;
  hydrate: () => Promise<void>;
  /** The server's answer: applied (and saved) unless this phone has an unconfirmed choice. */
  applyFromServer: (language: string | null) => void;
  /** The server saved `language`: if that is still this phone's choice, it is no longer pending. */
  markSynced: (language: LanguageCode) => void;
}

function apply(language: LanguageCode): void {
  if (i18n.language !== language) void i18n.changeLanguage(language);
}

export const useLanguage = create<LanguageState>((set, get) => ({
  language: DEFAULT_LANGUAGE,
  hydrated: false,
  chosenHere: false,

  setLanguage: (language) => {
    set({ language, chosenHere: true });
    apply(language);
    void AsyncStorage.multiSet([
      [KEY, language],
      [PENDING_KEY, "1"],
    ]).catch(() => {});
  },

  markSynced: (language) => {
    // An older request answering late must not clear a newer, unsent choice.
    if (get().language !== language) return;
    set({ chosenHere: false });
    void AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
  },

  hydrate: async () => {
    try {
      const [[, stored], [, pending]] = await AsyncStorage.multiGet([KEY, PENDING_KEY]);
      if (isLanguage(stored)) {
        set({ language: stored, chosenHere: pending === "1" });
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
    // An unconfirmed choice made on THIS phone wins. Otherwise the server's
    // (the laptop's) arrives here and is kept for the next cold start.
    if (get().chosenHere || !isLanguage(language)) return;
    if (get().language !== language) {
      set({ language });
      apply(language);
    }
    void AsyncStorage.setItem(KEY, language).catch(() => {});
  },
}));

/** Test seam: back to the launch state. */
export function __resetLanguage(): void {
  useLanguage.setState({ language: DEFAULT_LANGUAGE, hydrated: false, chosenHere: false });
  apply(DEFAULT_LANGUAGE);
}
