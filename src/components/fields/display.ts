/**
 * How a field's value READS in a row, by type: pure, so each type's sentence
 * is tested (`__tests__/display.test.ts`) rather than eyeballed. The editors
 * that change the value are in `FieldRow.tsx`.
 */
import type { FieldDefinition, FieldValue, RecordOption, SelectOption } from "@/api/fields";
import { htmlToPlainText } from "@/lib/richText";
import { formatDay, formatTime } from "@/screens/calendar/dates";

/** Labels for linked records the screen already holds (board members, labels, sprints, cards). */
export type KnownRecords = (field: FieldDefinition) => RecordOption[];

export function scalar(value: FieldValue | undefined): unknown {
  return value?.kind === "scalar" ? value.value : null;
}

export function selectedIds(value: FieldValue | undefined): number[] {
  return value?.kind === "records" ? value.selections.map((s) => s.recordId) : [];
}

export function isEmpty(value: FieldValue | undefined): boolean {
  if (!value) return true;
  if (value.kind === "records") return value.selections.length === 0;
  if (value.kind === "files") return value.files.length === 0;
  const v = value.value;
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

export function optionsFor(field: FieldDefinition, value: FieldValue | undefined): SelectOption[] {
  const v = scalar(value);
  const picked = Array.isArray(v) ? v.map(String) : v == null || v === "" ? [] : [String(v)];
  return picked.map((p) => field.config.options.find((o) => o.value === p) ?? { value: p, label: p, color: null });
}

/** The linked records, labelled from what the screen knows, else "#id" (never a blank chip). */
export function linkedRecords(field: FieldDefinition, value: FieldValue | undefined, known: KnownRecords): RecordOption[] {
  const all = known(field);
  return selectedIds(value).map((rid) => all.find((o) => o.id === rid) ?? { id: rid, label: `#${rid}`, color: null });
}

/** A datetime as the server stores it (ISO), in the phone's own zone. */
export function splitDateTime(iso: string): { day: string; time: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** A local day and time back to ISO (UTC), the way the web's datetime input sends it. */
export function joinDateTime(day: string, time: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
}

export function formatBytes(bytes: number, language: string): string {
  const fmt = (n: number) => n.toLocaleString(language, { maximumFractionDigits: n < 10 ? 1 : 0 });
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${fmt(bytes / 1024)} KB`;
  return `${fmt(bytes / (1024 * 1024))} MB`;
}

/**
 * One line for the row, or null when the value is empty (the row then says
 * "Empty" in its own words). Booleans have no line: the row shows a switch.
 */
export function displayValue(field: FieldDefinition, value: FieldValue | undefined, known: KnownRecords, language: string): string | null {
  if (isEmpty(value)) return null;
  const v = scalar(value);
  switch (field.fieldType) {
    case "rich_text":
      return htmlToPlainText(String(v), " · ") || null;
    case "integer":
    case "decimal":
    // A rollup is a number the server computed (count, sum, average, min, max).
    case "rollup": {
      const n = Number(v);
      return Number.isFinite(n) ? n.toLocaleString(language) : String(v);
    }
    case "date":
    case "created_time":
    case "last_modified_time":
      return typeof v === "string" ? formatDay(v.slice(0, 10), language, true) : null;
    case "datetime": {
      const parts = typeof v === "string" ? splitDateTime(v) : null;
      return parts ? `${formatDay(parts.day, language, true)} · ${formatTime(parts.time, language)}` : null;
    }
    case "single_select":
    case "multi_select":
      return optionsFor(field, value).map((o) => o.label).join(", ");
    case "single_record":
    case "multi_record":
      return linkedRecords(field, value, known).map((o) => o.label).join(", ");
    case "attachment":
    case "attachments":
      return value?.kind === "files" ? value.files.map((f) => f.filename).join(", ") : null;
    case "boolean":
      return null;
    default:
      return Array.isArray(v) ? v.join(", ") : String(v);
  }
}
