/**
 * THE TWO LOCALES, CHECKED AGAINST EACH OTHER.
 *
 * `fr.ts` is typed `Translations`, so a MISSING key is already a compile
 * error. What the compiler cannot see is the two failures that actually reach
 * a screen: a French value that is still the English sentence, and a French
 * value so much longer than the English that it breaks a row it has to fit.
 *
 * ── The length budget is a PROXY, and it is named as one ──────────────────
 * Nothing here measures pixels; Jest has no layout. French runs reliably
 * 15–20% longer than English for the same sentence, and the budget below is
 * 1.9×, which no honest translation of a UI string reaches. What it catches
 * is not a tight fit — the 360 dp French render pass is what covers that —
 * but a translation that has wandered into an explanation.
 */
import { en } from "../locales/en";
import { fr } from "../locales/fr";

type Leaves = Record<string, string>;

function flatten(value: unknown, prefix = ""): Leaves {
  const out: Leaves = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") out[path] = child;
    else Object.assign(out, flatten(child, path));
  }
  return out;
}

const ENGLISH = flatten(en);
const FRENCH = flatten(fr);

/**
 * Keys whose two values are legitimately identical — a word French borrowed,
 * a product name, or a string that is only an interpolation. Each is here
 * because it was checked, not because it looked foreign.
 */
const SAME_IN_BOTH = new Set([
  // Words French took whole, and one product name.
  "chat.title", // "Assistant"
  "chat.notifications", // "Notifications"
  "files.document", // "Document"
  "thread.message", // "Message"
  "language.english",
  "language.french",
  "answer.pauseReading",
  "notifications.title",
  "scope.notes",
  "scope.contacts",
  "scope.pages",
  "scope.flow",
  "calendar.minutes",
  "calendar.hours",
  "calendar.event",
  "files.photo",
  "sessions.messages_one",
  "sessions.messages_other",
]);

describe("the two locales", () => {
  it("have exactly the same keys", () => {
    expect(Object.keys(FRENCH).sort()).toEqual(Object.keys(ENGLISH).sort());
  });

  it("has no empty French value", () => {
    expect(Object.entries(FRENCH).filter(([, value]) => value.trim() === "")).toEqual([]);
  });

  // The failure this catches is a key added to `en.ts` and copied into
  // `fr.ts` to make the compiler happy. It renders English inside a French
  // app, which is worse than a missing translation because nothing reports it.
  it("has no French value that is still the English one", () => {
    const untranslated = Object.keys(ENGLISH).filter(
      (key) => !SAME_IN_BOTH.has(key) && ENGLISH[key] === FRENCH[key],
    );
    expect(untranslated).toEqual([]);
  });

  it("keeps every interpolation the English has", () => {
    const placeholders = (value: string) => (value.match(/\{\{\w+\}\}/g) ?? []).sort();
    const mismatched = Object.keys(ENGLISH).filter(
      (key) => placeholders(ENGLISH[key]).join() !== placeholders(FRENCH[key]).join(),
    );
    // A dropped `{{count}}` renders a sentence with a hole in it, and a
    // mistyped one renders the braces.
    expect(mismatched).toEqual([]);
  });

  it("has no French value that has wandered into an explanation", () => {
    const BUDGET = 1.9;
    const overlong = Object.keys(ENGLISH)
      .filter((key) => ENGLISH[key].length >= 12)
      .filter((key) => FRENCH[key].length > ENGLISH[key].length * BUDGET)
      .map((key) => `${key}: ${ENGLISH[key].length} → ${FRENCH[key].length}`);

    expect(overlong).toEqual([]);
  });

  // The web's French uses U+2019 throughout. An ASCII apostrophe in one
  // string beside a typographic one in the next is the tell that two hands
  // wrote them.
  it("uses the typographic apostrophe in French, as the web does", () => {
    const ascii = Object.entries(FRENCH)
      .filter(([, value]) => /\w'\w/.test(value))
      .map(([key]) => key);

    expect(ascii).toEqual([]);
  });
});
