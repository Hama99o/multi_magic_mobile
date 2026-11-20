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
