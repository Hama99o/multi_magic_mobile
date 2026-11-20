/**
 * A history entry as a sentence: the web's (`HistoryFeed.tsx:185-212`), the
 * same words in both languages (`tableApp.activity.lines.*`), the same
 * variables read from the entry's details. Pure, so every action's sentence
 * is a test.
 */
import type { HistoryItem } from "@/api/tables";

type T = (key: string, options?: Record<string, unknown>) => string;

/** Every action the server logs (`TableApp::Activity::KINDS`), as the i18n spells it (dots read as nesting there). */
export const HISTORY_ACTIONS = [
  "row.created", "row.updated", "rows.deleted", "rows.restored", "rows.written", "rows.updated",
  "column.added", "column.updated", "column.deleted", "column.restored", "columns.reordered",
  "link.added", "link.removed", "share.added", "share.changed", "share.removed",
  "view.created", "view.renamed", "view.deleted", "table.renamed", "table.duplicated",
  "import.done", "import.failed", "import.cancelled",
] as const;

export const lineKey = (action: string) => `tables.history.lines.${action.replace(".", "_")}`;

export function historyLine(item: HistoryItem, t: T): string {
  const d = item.details;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).join(", ") : "");
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const known = (HISTORY_ACTIONS as readonly string[]).includes(item.action);
  if (!known) return item.action;
  return t(lineKey(item.action), {
    who: item.who ?? t("tables.history.someone"),
    count: Number(d.count ?? 0),
    column: str(d.column),
    fields: list(d.fields),
    titles: list(d.titles),
    linked: list(d.linked),
    row: str(d.row),
    from: str(d.from ?? d.renamed_from),
    to: str(d.to),
    file: str(d.file),
    created: d.created ?? 0,
    updated: d.updated ?? 0,
    errors: d.errors ?? 0,
    person: str(d.who),
    view: str(d.view),
    role: d.role === "editor" || d.role === "viewer" ? t(`tables.share.roles.${d.role}`) : str(d.role),
  });
}

export type HistoryEntry = { kind: "day"; key: string; label: string } | { kind: "line"; key: string; item: HistoryItem };

/**
 * The lines under "Today", "Yesterday" or the date, as the web groups them
 * (`HistoryFeed.tsx`, weekday + day + month in the reader's language). Days
 * are the phone's own calendar days; the list stays newest first.
 */
export function historyDays(items: HistoryItem[], t: T, language: string, now: Date = new Date()): HistoryEntry[] {
  const dayOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = dayOf(now);
  const yesterday = dayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const fmt = new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long" });
  const out: HistoryEntry[] = [];
  let last: string | null = null;
  for (const item of items) {
    const at = new Date(item.at);
    const day = dayOf(at);
    if (day !== last) {
      out.push({ kind: "day", key: `day-${day}`, label: day === today ? t("tables.history.today") : day === yesterday ? t("tables.history.yesterday") : fmt.format(at) });
      last = day;
    }
    out.push({ kind: "line", key: String(item.id), item });
  }
  return out;
}
