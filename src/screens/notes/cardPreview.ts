/**
 * A GRID CARD'S PREVIEW: the first lines of a note's stored HTML as plain
 * text, keeping line breaks, indents and lists (owner's Keep screenshots,
 * 2026-11-13, not stored). It scans the HTML once, left to right, and stops
 * as soon as it has the lines it shows, so a 1 MB note costs what it shows
 * (the list once hung on a 914 KB note, snippet.ts).
 */
const BLOCKS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "div", "tr", "table", "hr"]);
const SKIP = new Set(["script", "style"]);
const MAX_LINE = 280;
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+|#39);/gi, (m, e: string) => {
    if (ENTITIES[e.toLowerCase()] !== undefined) return ENTITIES[e.toLowerCase()];
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return m;
  });

interface ListFrame {
  kind: "ul" | "ol" | "task";
  n: number;
}

export function cardPreview(html: string, maxLines: number): { lines: string[]; truncated: boolean } {
  const lines: string[] = [];
  let line = "";
  let prefix = "";
  let inPre = 0;
  let skip = 0;
  let blockHadText = false;
  const lists: ListFrame[] = [];
  let done = false;
  // Tables: one line per row, the cells joined with " · " (a cell's own
  // paragraphs stay in it, joined by a space).
  let row: string[] | null = null;
  let cell: string | null = null;

  const push = (text: string) => {
    if (lines.length > maxLines) {
      done = true;
      return;
    }
    // One blank line at most, never at the start.
    if (text === "" && (lines.length === 0 || lines[lines.length - 1] === "")) return;
    lines.push(text.length > MAX_LINE ? `${text.slice(0, MAX_LINE)}…` : text);
    if (lines.length > maxLines) done = true;
  };
  const endLine = (blankIfEmpty = false) => {
    const text = inPre ? line : line.replace(/\s+$/, "");
    if (text.trim()) push(prefix + text);
    else if (blankIfEmpty && !blockHadText) push("");
    if (text.trim()) prefix = prefix.replace(/[^ ]/g, " ").replace(/ +$/, (m) => m); // continuation lines align under the text
    line = "";
  };

  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while (!done && (m = re.exec(html))) {
    const [, closing, rawTag, attrs, text] = m;
    if (text !== undefined) {
      if (skip) continue;
      const t = decode(text);
      if (inPre) {
        const parts = t.split("\n");
        parts.forEach((part, i) => {
          if (i > 0) endLine();
          line += part;
        });
      } else if (cell !== null) {
        cell += t.replace(/\s+/g, " ");
      } else {
        const collapsed = t.replace(/\s+/g, " ");
        line += line ? collapsed : collapsed.replace(/^ /, "");
      }
      if (t.trim()) blockHadText = true;
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (SKIP.has(tag)) {
      skip += closing ? -1 : 1;
      continue;
    }
    if (tag === "tr") {
      if (!closing) {
        endLine();
        row = [];
      } else if (row) {
        const text = row.filter(Boolean).join(" · ");
        if (text) push(prefix + text);
        row = null;
      }
      continue;
    }
    if (tag === "td" || tag === "th") {
      if (!closing) cell = "";
      else if (cell !== null) {
        row?.push(cell.replace(/\s+/g, " ").trim());
        cell = null;
      }
      continue;
    }
    if (cell !== null) {
      // Inside a cell, blocks and breaks are a space, never a new line.
      if (BLOCKS.has(tag) || tag === "br") cell += " ";
      continue;
    }
    if (tag === "br") {
      endLine();
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      if (closing) lists.pop();
      else lists.push({ kind: /data-type="taskList"/.test(attrs) ? "task" : tag === "ol" ? "ol" : "ul", n: Number(/start="(\d+)"/.exec(attrs)?.[1] ?? 1) });
      endLine();
      continue;
    }
    if (tag === "li") {
      endLine();
      if (!closing) {
        const frame = lists[lists.length - 1];
        const indent = "    ".repeat(Math.max(0, lists.length - 1));
        const mark = !frame ? "• " : frame.kind === "task" ? (/data-checked="true"/.test(attrs) ? "☑ " : "☐ ") : frame.kind === "ol" ? `${frame.n++}. ` : "• ";
        prefix = indent + mark;
        blockHadText = true; // an empty item is not a blank line
      } else prefix = "";
      continue;
    }
    if (tag === "pre") {
      endLine();
      inPre += closing ? -1 : 1;
      continue;
    }
    if (BLOCKS.has(tag)) {
      if (closing) {
        endLine(true);
        if (!lists.length) prefix = "";
      } else {
        endLine();
        blockHadText = false;
      }
    }
  }
  if (!done) endLine();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  const truncated = lines.length > maxLines;
  return { lines: lines.slice(0, maxLines), truncated };
}
