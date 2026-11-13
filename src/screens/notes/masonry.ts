/**
 * Keep's staggered grid (owner's Keep screenshots, 2026-11-13, not stored):
 * each item goes to the currently shorter column, so every column keeps the
 * list's order top to bottom. One column is the list layout.
 */
export function masonry<T>(items: T[], height: (item: T) => number, columns: number): T[][] {
  const cols: T[][] = Array.from({ length: Math.max(1, columns) }, () => []);
  const heights = cols.map(() => 0);
  for (const item of items) {
    let target = 0;
    for (let c = 1; c < cols.length; c++) if (heights[c] < heights[target]) target = c;
    cols[target].push(item);
    heights[target] += height(item);
  }
  return cols;
}
