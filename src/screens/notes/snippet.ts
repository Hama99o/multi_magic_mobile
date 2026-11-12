/**
 * The one-line preview under a note's title in the list. Cheap on purpose:
 * the list does not parse every body with the codec; a tag strip of the
 * stored HTML is enough for two lines of grey text.
 */
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

export function noteSnippet(html: string, max = 140): string {
  const text = html
    .replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|h[1-6]|li|blockquote|pre|tr|div)>/gi, " · ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_m, e: string) => ENTITIES[e])
    .replace(/\s+/g, " ")
    .replace(/^(\s*·\s*)+|(\s*·\s*)+$/g, "")
    .replace(/(\s*·\s*){2,}/g, " · ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
