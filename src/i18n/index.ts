/**
 * ENGLISH AND FRENCH, THE SAME TWO THE WEB HAS.
 *
 * His words: *"same lang as we have in web, both mode."* The web ships
 * `supportedLngs: ['en', 'fr']` (`app/javascript/i18n/index.ts`) with a
 * switcher in the top bar, and saves the choice on the USER
 * (`AuthContext.tsx` → `PATCH /users/:id { user: { lang } }`). This app does
 * the same, reads the same field, and writes the same values — so somebody
 * who switches on the laptop finds the phone already switched.
 *
 * ── Why the keys are not the web's file, copied ───────────────────────────
 * The web's `en.ts` is 81 KB for twelve apps this one does not have. Where a
 * string exists in both, the FRENCH IS THE WEB'S, taken from
 * `app/javascript/i18n/locales/fr.ts` so the two never drift apart in wording
 * — "Discussions" rather than a second translation of "Chats". Where a string
 * is only here, the French is this session's and is listed in
 * `docs/LANGUAGES.md` as awaiting his eye.
 *
 * ── `t` is usable outside React, deliberately ─────────────────────────────
 * Some sentences are chosen where there is no component: an upload's refusal
 * (`useAttachments`), a failure's sentence (`api/failure`), why a session
 * ended (`auth.store`). Those import `t` from here. i18next's own `t` is
 * bound to the initialised instance, so it is the same translation the
 * components get, including after a switch.
 *
 * ── No language DETECTOR ──────────────────────────────────────────────────
 * The web uses `i18next-browser-languagedetector` with localStorage. On a
 * phone the equivalent would be the OS locale, and that is the wrong default
 * here: the UI is English by decision (`BRIEF.md` §4) and the corpus is
 * largely French, so a French phone would flip the interface on a person who
 * never asked. The order is: his saved choice, then the server's, then
 * English.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { fr } from "./locales/fr";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export function isLanguage(value: unknown): value is LanguageCode {
  return LANGUAGES.some((language) => language.code === value);
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: LANGUAGES.map((language) => language.code),
  interpolation: {
    // React escapes for us; i18next escaping on top mangles an apostrophe
    // into `&#39;` — which in French is most sentences.
    escapeValue: false,
  },
  returnNull: false,
});

/** The bound `t`, for the sentences chosen outside a component. */
export const t = i18n.t.bind(i18n);

export default i18n;
