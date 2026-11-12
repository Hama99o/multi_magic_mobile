/**
 * The one-line preview under a note's title in the list. Cheap on purpose:
 * the list does not parse every body with the codec; a tag strip of the
 * stored HTML is enough for two lines of grey text.
 */
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

// A block boundary while stripping. Joined with " · " at the end, by a split
// rather than by regexes: `(\s*·\s*)+$` backtracked exponentially on runs of
// empty paragraphs and hung the list on a real 914 KB note (device QA
// 2026-11-12).
const SEP = String.fromCharCode(1);

export function noteSnippet(html: string, max = 140): string {
  const text = html
    .replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|h[1-6]|li|blockquote|pre|tr|div)>/gi, SEP)
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_m, e: string) => ENTITIES[e])
    .split(SEP)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" · ");
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
