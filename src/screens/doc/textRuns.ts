/**
 * THE TEXT EDITOR'S MODEL (web `TextEditorDoc.tsx`, `lib/pdfText.ts`;
 * multi_magic `docs/PDF_EDITOR.md`).
 *
 * `pdf/text` answers every text run with its box in PDF points (origin
 * bottom-left), font, size, colour and the font's ALPHABET — a PDF embeds a
 * subset, so a page that never printed a "4" cannot write one in its own
 * font. A run is addressed by page, content stream and position in that
 * stream. Only the runs that actually changed are sent to `pdf/edit`.
 *
 * Pure: everything here is tested without a page.
 */
import { arr, num, obj, optStr } from "@/api/parse";

export type Family = "original" | "sans" | "serif" | "mono";

export interface TextRun {
  page: number;
  container: string;
  index: number;
  text: string | null;
  readable: boolean;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  font: string;
  color: string;
  alphabet: string | null;
}

export interface Outline {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageGeometry {
  index: number;
  width: number;
  height: number;
  rotation: number;
}

export interface TextDocument {
  runs: TextRun[];
  pages: PageGeometry[];
  truncated: boolean;
  unreadable: number;
  outlines: Outline[];
}

export interface Draft {
  text: string;
  family?: Family;
  bold?: boolean;
  italic?: boolean;
  size?: number;
  color?: string;
  highlight?: string;
}

export type Drafts = Record<string, Draft>;

export const TEXT_COLORS = [
  { value: "#000000", label: "doc.text.colors.black" },
  { value: "#444444", label: "doc.text.colors.grey" },
  { value: "#cc0000", label: "doc.text.colors.red" },
  { value: "#0b5cd5", label: "doc.text.colors.blue" },
  { value: "#0f7a3d", label: "doc.text.colors.green" },
  { value: "#b45309", label: "doc.text.colors.brown" },
] as const;

export const HIGHLIGHTS = [
  { value: "#ffe066", label: "doc.text.highlights.yellow" },
  { value: "#a7f3d0", label: "doc.text.highlights.green" },
  { value: "#bfdbfe", label: "doc.text.highlights.blue" },
  { value: "#fbcfe8", label: "doc.text.highlights.pink" },
] as const;

export const SIZE_MIN = 4;
export const SIZE_MAX = 96;

const n = (v: unknown, field: string) => num(typeof v === "string" ? Number(v) : v, field);

export function parseTextDocument(raw: unknown): TextDocument {
  const o = obj(raw, "pdf/text");
  return {
    runs: arr(o.runs, "runs").map((r) => {
      const run = obj(r, "run");
      return {
        page: n(run.page, "page"),
        container: optStr(run.container) ?? "page",
        index: n(run.index, "index"),
        text: optStr(run.text),
        readable: run.readable !== false,
        visible: run.visible !== false,
        x: n(run.x, "x"),
        y: n(run.y, "y"),
        width: n(run.width, "width"),
        height: n(run.height, "height"),
        size: n(run.size, "size"),
        font: optStr(run.font) ?? "",
        color: optStr(run.color) ?? "#000000",
        alphabet: optStr(run.alphabet),
      };
    }),
    pages: arr(o.pages, "pages").map((p) => {
      const g = obj(p, "page");
      return { index: n(g.index, "index"), width: n(g.width, "width"), height: n(g.height, "height"), rotation: typeof g.rotation === "number" ? g.rotation : 0 };
    }),
    truncated: o.truncated === true,
    unreadable: typeof o.unreadable === "number" ? o.unreadable : 0,
    outlines: Array.isArray(o.outlines)
      ? o.outlines.map((l) => {
          const r = obj(l, "outline");
          return { page: n(r.page, "page"), x: n(r.x, "x"), y: n(r.y, "y"), width: n(r.width, "width"), height: n(r.height, "height") };
        })
      : [],
  };
}

/** A run's address: page, stream, position in that stream. */
export const keyOf = (run: Pick<TextRun, "page" | "container" | "index">) => `${run.page}|${run.container}|${run.index}`;

export function addressOf(key: string): { page: number; container: string; index: number } {
  const parts = key.split("|");
  const index = Number(parts.pop());
  const page = Number(parts.shift());
  // A form XObject's name could hold a "|": what is between is the stream.
  return { page, container: parts.join("|"), index };
}

export const isEditable = (run: TextRun) => run.readable && run.visible;

export function isChanged(run: TextRun, draft: Draft | undefined): boolean {
  if (!draft) return false;
  return (
    draft.text !== (run.text ?? "") ||
    (draft.family !== undefined && draft.family !== "original") ||
    draft.bold === true ||
    draft.italic === true ||
    (draft.size !== undefined && draft.size !== run.size) ||
    (draft.color !== undefined && draft.color !== run.color) ||
    draft.highlight !== undefined
  );
}

/** Everything but a highlight repaints the words, so the preview covers the old ones. */
export function repaints(run: TextRun, draft: Draft): boolean {
  return (
    draft.text !== (run.text ?? "") ||
    (draft.family !== undefined && draft.family !== "original") ||
    draft.bold === true ||
    draft.italic === true ||
    (draft.size !== undefined && draft.size !== run.size) ||
    (draft.color !== undefined && draft.color !== run.color)
  );
}

export interface PdfEdit {
  page: number;
  index: number;
  container: string;
  text: string;
  family?: string;
  bold?: boolean;
  italic?: boolean;
  size?: number;
  color?: string;
  highlight?: string;
  box?: { x: number; y: number; width: number; height: number };
}

/** Only what changed, addressed as the server addressed it (web `edits`). */
export function buildEdits(drafts: Drafts, byKey: Map<string, TextRun>): PdfEdit[] {
  return Object.entries(drafts).flatMap(([key, draft]) => {
    const run = byKey.get(key);
    if (!run || !isChanged(run, draft)) return [];
    const edit: PdfEdit = { ...addressOf(key), text: draft.text };
    if (draft.family && draft.family !== "original") edit.family = draft.family;
    if (draft.bold) edit.bold = true;
    if (draft.italic) edit.italic = true;
    if (draft.size !== undefined && draft.size !== run.size) edit.size = draft.size;
    if (draft.color !== undefined && draft.color !== run.color) edit.color = draft.color;
    if (draft.highlight) {
      edit.highlight = draft.highlight;
      edit.box = { x: run.x, y: run.y, width: run.width, height: run.height };
    }
    return [edit];
  });
}

/**
 * The characters this run's own font cannot write. A restyled line is written
 * in a standard font that has them all, so it has none missing.
 */
export function missingGlyphs(run: TextRun, draft: Draft): string[] {
  const restyled = (draft.family && draft.family !== "original") || draft.bold || draft.italic;
  if (restyled || run.alphabet === null) return [];
  const alphabet = new Set([...run.alphabet]);
  return [...new Set([...draft.text])].filter((c) => !alphabet.has(c) && c !== " ");
}

export const isRestyled = (draft: Draft) => Boolean((draft.family && draft.family !== "original") || draft.bold || draft.italic);

/** Where a box sits, in fractions of the page (top-left origin), never thinner than 1.2 %. */
export function boxOn(geometry: PageGeometry, rect: { x: number; y: number; width: number; height: number }) {
  return {
    left: rect.x / geometry.width,
    top: (geometry.height - rect.y - rect.height) / geometry.height,
    width: Math.max(rect.width / geometry.width, 0.012),
    height: Math.max(rect.height / geometry.height, 0.012),
  };
}

/** The four kinds of "nothing to edit here", which are not the same thing. */
export type LoadWarning = "tooMuchText" | "onlyInvisible" | "onlyUnreadable" | "noText" | null;
export function loadWarning(doc: TextDocument): LoadWarning {
  if (doc.runs.some(isEditable)) return doc.truncated ? "tooMuchText" : null;
  if (doc.runs.some((r) => r.readable)) return "onlyInvisible";
  if (doc.runs.length > 0) return "onlyUnreadable";
  return "noText";
}

export interface ReportSummary {
  applied: number;
  rejected: number;
  substituted: { count: number; characters: string };
  sharedWith: number;
}

/** The `X-Edit-Report` header, summed up for the four messages the web shows. */
export function summarise(report: unknown, sent: number): ReportSummary {
  const r = (typeof report === "object" && report !== null ? report : {}) as { applied?: unknown; rejected?: unknown };
  const applied = Array.isArray(r.applied) ? (r.applied as { strategy?: unknown; forced_by?: unknown; shared_with?: unknown }[]) : null;
  const rejected = Array.isArray(r.rejected) ? r.rejected.length : 0;
  if (!applied) return { applied: sent, rejected, substituted: { count: 0, characters: "" }, sharedWith: 0 };
  const substituted = applied.filter((a) => a.strategy === "substituted_font");
  return {
    applied: applied.length,
    rejected,
    substituted: { count: substituted.length, characters: [...new Set(substituted.map((a) => String(a.forced_by ?? "")).join(""))].join("") },
    sharedWith: Math.max(0, ...applied.map((a) => (typeof a.shared_with === "number" ? a.shared_with : 0))),
  };
}

/** For a missing value: a string, or the empty string, never "undefined". */
export const textOf = (run: TextRun) => run.text ?? "";
