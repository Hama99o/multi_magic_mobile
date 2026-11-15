/**
 * Server fields the web writes with its rich-text editor come back as Tiptap
 * HTML (contact notes: the web's `ContactDrawer` edits them with
 * `RichTextEditor` and shows them with `dangerouslySetInnerHTML`). A plain
 * `<Text>` draws the tags as text (TestFlight 1.2.0: `<p>…</p><p></p>` on a
 * contact's card).
 *
 * - `isRichText`: is this value HTML at all? Older values were typed as plain
 *   text and must still read exactly as typed.
 * - `parseRichText`: the document for the native read view (`RichText`,
 *   `NoteDocument`), parsed with the Notes app's own rules, without the empty
 *   paragraphs the web editor leaves at the end.
 * - `htmlToPlainText`: the words, for a copy or a one-line preview: tags
 *   stripped, entities decoded, whitespace collapsed, one block per line.
 *   Plain text is returned untouched.
 */
import { parseNoteHtml } from "@/screens/notes/document";
import type { DocNode } from "@/vendor/tiptop-schema";

/** An opening, closing or self-closing tag: `<p>`, `</p>`, `<br/>`, `<span style="…">`. */
const TAG = /<\/?[a-z][a-z0-9-]*(\s[^<>]*)?\/?>/i;

export function isRichText(value: string | null | undefined): value is string {
  return !!value && TAG.test(value);
}

/** A paragraph with nothing in it but spaces. */
function isEmptyParagraph(node: DocNode): boolean {
  if (node.type !== "paragraph") return false;
  return (node.content ?? []).every((c) => c.type === "text" && !(c.text ?? "").trim());
}

export function parseRichText(html: string): DocNode {
  const { doc } = parseNoteHtml(html);
  const content = [...(doc.content ?? [])];
  while (content.length && isEmptyParagraph(content[content.length - 1])) content.pop();
  return { ...doc, content };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntity(entity: string, name: string): string {
  if (name[0] === "#") {
    const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  }
  return ENTITIES[name] ?? entity;
}

// A block boundary while stripping, split on rather than cleaned up with
// regexes (see `src/screens/notes/snippet.ts`: `(\s*·\s*)+$` backtracked
// exponentially on runs of empty paragraphs).
const SEP = String.fromCharCode(1);

/** Plain text (no tags) comes back exactly as it was typed. */
export function htmlToPlainText(value: string, separator = "\n"): string {
  if (!isRichText(value)) return value;
  return value
    .replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|h[1-6]|li|blockquote|pre|tr|div)>/gi, SEP)
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, decodeEntity)
    .split(SEP)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(separator);
}
