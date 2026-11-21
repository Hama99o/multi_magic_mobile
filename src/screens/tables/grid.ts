/**
 * THE TABLET GRID'S LAYOUT (increment 9; the web's `Grid.tsx`), pure:
 *   - when: the web swaps its grid for cards below 720 px (`TableScreen.tsx`
 *     phone mode), so the phone shows the grid from 720 dp wide, on a grid view;
 *   - widths: the view's own (`column_widths`, set on the web), else the web's
 *     defaults by type; the title column is 220;
 *   - the summary bar: per column how many rows are filled, and a number's
 *     sum and average, over the whole view (`records#summary`).
 */
import type { FieldDefinition } from "@/api/fields";

/** The web's phone breakpoint (`TableScreen.tsx`: below 720 px, cards). */
export const GRID_MIN_WIDTH = 720;
export const TITLE_WIDTH = 220;
const DEFAULT_WIDTH = 180;
/** The web's `WIDTH` by type (`Grid.tsx:93`). */
const WIDTH: Record<string, number> = { boolean: 96, date: 140, decimal: 120, phone: 190, single_select: 170, long_text: 260, multi_record: 200 };
/** The server's clamp (`ViewsController::COLUMN_WIDTH`). */
const MIN = 60;
const MAX = 800;

export const showsGrid = (screenWidth: number, viewType: string) => viewType === "grid" && screenWidth >= GRID_MIN_WIDTH;

export function columnWidth(field: FieldDefinition, primaryFieldId: number | null, widths: Record<string, number> | null | undefined): number {
  const saved = widths?.[String(field.id)];
  if (typeof saved === "number" && saved > 0) return Math.min(MAX, Math.max(MIN, saved));
  return field.id === primaryFieldId ? TITLE_WIDTH : (WIDTH[field.fieldType] ?? DEFAULT_WIDTH);
}

export { parseSummary, type SummaryCell } from "@/api/tables";
