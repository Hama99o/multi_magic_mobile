/**
 * Finance's tab row: how wide each tab is, and where the row scrolls to.
 *
 * Device, 2026-11-25 (flow 160): the five tabs filled a phone's row exactly,
 * so Budgets sat wholly off-screen with nothing to say there was more. The
 * rule (Hello): on a phone the next tab always PEEKS, half a tab, and the
 * selected tab is scrolled into view. When every tab fits, they share the row.
 */

/** A tab's least width at a 100 % system font, in dp; it grows with the font, to 200 %. */
const TAB_MIN = 80;

export function tabLayout(rowWidth: number, count: number, fontScale: number): { width: number; scrolls: boolean } {
  const scale = Math.min(Math.max(Number.isFinite(fontScale) ? fontScale : 1, 1), 2);
  const min = TAB_MIN * scale;
  if (rowWidth >= count * min) return { width: rowWidth / count, scrolls: false };
  // Whole tabs, then half of the next: n + 0.5 tabs across the row.
  const whole = Math.max(1, Math.floor(rowWidth / min - 0.5));
  return { width: rowWidth / (whole + 0.5), scrolls: true };
}

/**
 * The offset that shows tab `index` WHOLE with HALF of the next one beside it,
 * never past either end. Centring it (the first cut) left a quarter of each
 * neighbour at 200 %, hidden by the fade: no peek at all (RC gate, 2026-11-25).
 */
export function tabScrollX(index: number, width: number, rowWidth: number, count: number): number {
  const max = Math.max(0, count * width - rowWidth);
  const withPeek = (index + 1.5) * width - rowWidth;
  return Math.min(max, index * width, Math.max(0, withPeek));
}
