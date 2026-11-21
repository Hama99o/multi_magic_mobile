/**
 * Matching for the rows the phone holds itself: its apps and its "New …"
 * commands. Records are ranked by the server (Search::Global); these tiers are
 * the web's (`components/search/rank.ts`) and the server's, so a local row and
 * a record that match equally well sort together.
 *
 * One addition: accents and case are folded first, as the app switcher does,
 * so "taches" finds "Tâches" and "depenses" finds "Dépenses".
 */

export const EXACT = 100;
export const PREFIX = 80;
export const WORD_PREFIX = 62;
export const CONTAINS = 45;
export const SUBSEQUENCE = 20;

const WORD_BOUNDARY = /[\s\-_/.·:,]+/;

/** Lower case, accents dropped. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const words = (text: string) => text.split(WORD_BOUNDARY).filter(Boolean);

function isSubsequence(text: string, needle: string): boolean {
  let i = 0;
  for (const char of text) {
    if (char === needle[i]) i += 1;
    if (i === needle.length) return true;
  }
  return needle.length === 0;
}

const initials = (text: string) => words(text).map((w) => w[0]).join("");

/** How well `text` answers `needle`, or null for no match. `aliases` match a tier lower. */
export function score(text: string, needle: string, aliases: string[] = []): number | null {
  const q = fold(needle.trim());
  if (!q) return 0;
  const haystack = fold(text);
  if (haystack === q) return EXACT;
  if (haystack.startsWith(q)) return PREFIX;
  if (words(haystack).some((w) => w.startsWith(q))) return WORD_PREFIX;
  if (haystack.includes(q)) return CONTAINS;
  if (q.length >= 2 && initials(haystack).startsWith(q)) return WORD_PREFIX - 1;
  for (const alias of aliases) {
    const other = fold(alias);
    if (other === q || other.startsWith(q)) return WORD_PREFIX - 2;
    if (words(other).some((w) => w.startsWith(q))) return CONTAINS - 1;
    if (other.includes(q)) return SUBSEQUENCE + 5;
  }
  if (q.length >= 3 && isSubsequence(haystack, q)) return SUBSEQUENCE;
  return null;
}
