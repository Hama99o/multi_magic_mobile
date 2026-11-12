/**
 * Pure helpers that turn read-only blocks into the static previews of
 * RawBlockCard. Tested in Jest; no React here.
 */
import { textOf } from "./dir";
import type { DocNode } from "./types";

/** The text of every cell, row by row (at most `maxRows` rows). */
export function tableRows(table: DocNode, maxRows = 6): string[][] {
  return (table.content ?? []).slice(0, maxRows).map((row) =>
    (row.content ?? []).map((cell) =>
      (cell.content ?? []).map(textOf).join(" ").replace(/\s+/g, " ").trim(),
    ),
  );
}

/** [rows, columns] of a table (columns counted with colspans, from the widest row). */
export function tableSize(table: DocNode): [number, number] {
  const rows = table.content ?? [];
  const cols = Math.max(0, ...rows.map((r) => (r.content ?? []).reduce((n, c) => n + (Number(c.attrs?.colspan) || 1), 0)));
  return [rows.length, cols];
}

function attr(html: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(html);
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[3] ?? "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** Only http(s) URLs are shown or opened. */
const httpUrl = (url: string | null): string | null => (url && /^https?:\/\//i.test(url) ? url : null);

export interface RawInfo {
  kind: "legacyImage" | "embed" | "unknown";
  imageUri?: string;
  /** Where "View on web" can also lead for an embed: the video page. */
  url?: string;
}

const YOUTUBE_EMBED = /^https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})/i;

/** What a raw element is, from its tag and markup. */
export function rawInfo(tag: string, html: string): RawInfo {
  if (tag === "img" || tag === "picture") {
    const src = httpUrl(attr(html, "src"));
    return src ? { kind: "legacyImage", imageUri: src } : { kind: "unknown" };
  }
  if (tag === "iframe" || tag === "video" || tag === "embed" || tag === "object" || tag === "audio") {
    const src = httpUrl(attr(html, "src") ?? attr(html, "data"));
    const yt = src ? YOUTUBE_EMBED.exec(src) : null;
    return { kind: "embed", url: yt ? `https://www.youtube.com/watch?v=${yt[1]}` : src ?? undefined };
  }
  return { kind: "unknown" };
}

/** The ordered-list marker for item `index` (0-based) of a list with `start` and HTML `type`. */
export function orderedMarker(index: number, start: number, type: string | null): string {
  const n = start + index;
  switch (type) {
    case "a":
      return `${alpha(n)}.`;
    case "A":
      return `${alpha(n).toUpperCase()}.`;
    case "i":
      return `${roman(n)}.`;
    case "I":
      return `${roman(n).toUpperCase()}.`;
    default:
      return `${n}.`;
  }
}

function alpha(n: number): string {
  if (n <= 0) return String(n);
  let out = "";
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function roman(n: number): string {
  if (n <= 0 || n >= 4000) return String(n);
  const table: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  for (const [value, digits] of table) {
    while (n >= value) {
      out += digits;
      n -= value;
    }
  }
  return out;
}

/** Bullets by nesting depth, like the web's disc / circle / square. */
export const bulletMarker = (depth: number): string => ["•", "◦", "▪"][depth % 3];
