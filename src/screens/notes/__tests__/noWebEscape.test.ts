/**
 * Audit #9, #10 (2026-11-16): no Notes text sends the person to the web.
 * The phone writes notes (empty state), the too-long note says what it is
 * without an elsewhere, and a conflict may come from another phone, not only
 * the web (audit P2).
 */
import { en } from "@/i18n/locales/en";
import { fr } from "@/i18n/locales/fr";

const WEB = /\bweb\b/i;
const pick = (loc: typeof en) => [loc.notes.empty, loc.notes.edit.tooLong, loc.notes.edit.conflict.title, loc.notes.edit.conflict.body, loc.notes.edit.conflict.web];

it.each([["en", en], ["fr", fr]] as const)("%s: no Notes text points at the web", (_name, loc) => {
  for (const text of pick(loc as typeof en)) expect(text).not.toMatch(WEB);
});
