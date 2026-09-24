/**
 * THE FRENCH SWEEP, shared by every suite that renders UI in both languages
 * (`screens.render.test.tsx`, `sheets.i18n.test.tsx`).
 *
 * Two checks, because they fail on different things:
 * - `englishIn`: a rendered string carrying an English-only word. A net,
 *   not a dictionary.
 * - `identicalIn`: a string byte-identical in the English and French
 *   renders. A string that went through `t()` differs by construction; one
 *   that never did is the same. This one needs no vocabulary.
 *
 * Both read what RENDERED: each host text node, and each accessibility label,
 * hint and placeholder. So they see strings built in code, which the `<Text>`
 * lint rule cannot (the chats rows and the suggested questions were English
 * that way until 2026-09-24).
 */
import { readFileSync } from "fs";
import { screen } from "@testing-library/react-native";

/**
 * English words that are NOT also French, so "message", "contacts", "notes",
 * "pages" and "conversation" are deliberately absent.
 */
export const ENGLISH_ONLY =
  /\b(the|you|your|yours|is|are|was|were|what|when|where|which|who|how|with|this|that|these|and|from|have|has|not|yet|will|can|could|would|should|about|there|their|of|to|for|it|its|no|loading|delete|deleted|cancel|save|saved|back|send|retry|unread|search|settings|sign|account|password|edit|remove|close|done|error|failed|untitled|today|yesterday|online|typing|someone|upcoming|nothing|something|try|again|chat|chats|keys?|key)\b/i;

/**
 * Strings that are genuinely the same word in both languages. Each matches a
 * key in `locales.test.ts`'s own SAME_IN_BOTH, so the two lists cannot drift.
 */
export const SAME_IN_BOTH = new Set([
  "Assistant", // chat.title
  "Notifications", // chat.notifications
  "Message", // thread.message
  "30 min", // calendar.minutes: "min" is the French abbreviation too
  // language.english / language.french: each language is named in ITSELF,
  // so the language chooser reads the same in both.
  "English",
  "Français",
  // scope.notes / scope.pages / scope.contacts: the same words in French;
  // scope.flow: Flow is a product name.
  "Notes",
  "Pages",
  "Contacts",
  "Flow",
]);

/** Every string the current screen rendered, skipping any node inside
 *  `exceptTestID` (the privacy policy is one English document by design). */
export function renderedStrings(exceptTestID?: string): string[] {
  const out: string[] = [];
  const excluded = (node: { parent: unknown; props: { testID?: string } } | null): boolean => {
    if (!exceptTestID) return false;
    for (let n = node; n; n = n.parent as typeof node) if (n.props?.testID === exceptTestID) return true;
    return false;
  };
  for (const node of screen.UNSAFE_root.findAll(() => true, { deep: true })) {
    if (typeof node.type !== "string") continue;
    if (excluded(node as never)) continue;
    const { children, accessibilityLabel, accessibilityHint, placeholder } = node.props as Record<string, unknown>;
    if (node.type === "Text") {
      const text = ([] as unknown[])
        .concat(children)
        .filter((c) => typeof c === "string" || typeof c === "number")
        .join("");
      if (text.trim()) out.push(text.trim());
    }
    for (const v of [accessibilityLabel, accessibilityHint, placeholder]) {
      if (typeof v === "string" && v.trim()) out.push(v.trim());
    }
  }
  return [...new Set(out)];
}

/**
 * Cuts the test's own FIXTURE DATA out of a rendered string: the double-quoted
 * literals in the test file's CODE. A rendered string often wraps one
 * ("Non lu : <his title>"), so each is cut out rather than matched whole.
 *
 * CODE ONLY, not comments. The first version read the whole file, and the
 * file's comments QUOTE the bugs the sweep exists to find ("11:30 AM",
 * "Sep 18"), so writing a bug down exempted it (TESTING.md §19).
 */
export function fixtureStripper(testFile: string): (text: string) => string {
  const code = readFileSync(testFile, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    // Nor the strings a test ASSERTS or NAMES: they are what the test looks
    // for, not data it feeds in. Found 2026-09-24: `chat.test.tsx` titles a
    // test "Ask again re-sends the last question" and asserts
    // getByText("Ask again"), so a hard-coded English "Ask again" was cut out
    // as fixture data and the sweep stayed green. The limit: a string passed
    // any other way is still treated as data.
    .replace(
      /(\b(?:it|test|describe)(?:\.each\([^)]*\))?\s*\(|\b(?:get|find|query)(?:All)?By(?:Text|LabelText|PlaceholderText|DisplayValue|Hint)\s*\(|\.(?:toBe|toEqual|toContain|toMatch|toHaveBeenCalledWith)\s*\()\s*"(?:[^"\\\n]|\\.)*"/g,
      "$1",
    );
  // EVERY literal is matched, and the short ones dropped AFTER. Requiring four
  // characters inside the regex desynchronised the quote pairing: past a
  // `"Qa"` it matched `", lastName: "` as a string and never saw
  // `"Qa Mobile"` (found by the sheets sweep, 2026-09-24).
  const literals = [...code.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)]
    .map((m) => m[1])
    .filter((literal) => literal.length >= 4)
    .sort((a, b) => b.length - a.length);
  return (text) => literals.reduce((rest, literal) => rest.split(literal).join(" "), text);
}

export function englishIn(strings: string[], strip: (s: string) => string): string[] {
  return strings.filter((s) => ENGLISH_ONLY.test(strip(s)));
}

/**
 * A string identical in both renders that is made ONLY of fixture data and
 * same-in-both words is legitimate: the assistant's spoken label is
 * "Assistant. <the server's sentence>" in either language. So the allowed
 * words are cut out of what is left after the fixtures, as whole words, and
 * only a residue with letters in it is a finding.
 */
const ALLOWED_WORDS = [...SAME_IN_BOTH].map(
  (w) => new RegExp(`(^|[^A-Za-zÀ-ÿ])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-zÀ-ÿ])`, "g"),
);

export function identicalIn(fr: string[], en: string[], strip: (s: string) => string): string[] {
  const english = new Set(en);
  return fr.filter((s) => {
    if (!english.has(s)) return false;
    const residue = ALLOWED_WORDS.reduce((rest, word) => rest.replace(word, "$1 "), strip(s));
    return /[A-Za-zÀ-ÿ]{2,}/.test(residue);
  });
}
