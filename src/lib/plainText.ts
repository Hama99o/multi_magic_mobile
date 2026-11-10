/**
 * An answer's markdown as the text a person reads on the screen, for the
 * clipboard (`AnswerActions` → "Copy answer"). Seen 2026-11-10: copying
 * pasted `**Itinerary.pdf**` and `[Itinerary.pdf](/rails/active_storage/…)`.
 *
 * - a link becomes its text; a web address (http/https) is kept in brackets
 *   after it, an app path (`/notes/12`, `/rails/…`) is dropped — it opens
 *   nothing outside the app;
 * - bold, italic, inline code and heading marks go; list markers, numbers
 *   and blank lines stay, so the shape survives a paste.
 *
 * Deliberately small: the answers are the assistant's own markdown, not
 * arbitrary documents, and a lone `*` or `snake_case` is left alone.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, text: string, url: string) =>
      /^https?:\/\//i.test(url) && text !== url ? `${text} (${url})` : text,
    )
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1");
}
