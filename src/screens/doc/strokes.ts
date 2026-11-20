/**
 * A drawn signature as data: strokes of [x, y, pressure] points in the pad's
 * own coordinates, the web's shape (`SignaturePad.tsx`), so a signature drawn
 * on the phone opens for editing on the laptop and the other way round.
 *
 * Pure, so the path maths is tested without a canvas.
 */
import type { Point, Stroke } from "@/api/doc";

export const PEN_COLORS = [
  { value: "#0f172a", label: "doc.creator.colors.ink" },
  { value: "#1d4ed8", label: "doc.creator.colors.blue" },
  { value: "#4338ca", label: "doc.creator.colors.royal" },
  { value: "#b91c1c", label: "doc.creator.colors.red" },
  { value: "#15803d", label: "doc.creator.colors.green" },
] as const;

export const DRAW_BACKGROUNDS = [
  { value: "#ffffff", label: "doc.creator.backgrounds.white" },
  { value: "#fdf6e3", label: "doc.creator.backgrounds.cream" },
  { value: "#f8fafc", label: "doc.creator.backgrounds.paper" },
  { value: "transparent", label: "doc.creator.backgrounds.transparent" },
] as const;

export const TYPE_BACKGROUNDS = [
  { value: "transparent", label: "doc.creator.backgrounds.transparent" },
  { value: "#ffffff", label: "doc.creator.backgrounds.white" },
  { value: "#fdf6e3", label: "doc.creator.backgrounds.cream" },
] as const;

export const THICKNESS = [
  { value: 2, label: "doc.creator.thin" },
  { value: 3.5, label: "doc.creator.medium" },
  { value: 6, label: "doc.creator.thick" },
] as const;

/** Points closer than this (dp) add nothing but weight to the request. */
export const MIN_STEP = 1.5;

/** A new point, or null when it is too close to the last one to matter. */
export function nextPoint(last: Point | undefined, x: number, y: number): Point | null {
  if (last && Math.hypot(x - last[0], y - last[1]) < MIN_STEP) return null;
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, 0.5];
}

/**
 * A smooth SVG path through the points: quadratic curves between midpoints,
 * the usual way to turn finger samples into a line without corners. A single
 * point (a dot, the i's) becomes a zero-length line that a round cap draws.
 */
export function pathFor(points: Point[]): string {
  if (points.length === 0) return "";
  const [x0, y0] = points[0];
  if (points.length === 1) return `M ${x0} ${y0} L ${x0 + 0.01} ${y0}`;
  if (points.length === 2) return `M ${x0} ${y0} L ${points[1][0]} ${points[1][1]}`;
  let d = `M ${x0} ${y0}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += ` Q ${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d} L ${lx} ${ly}`;
}

/** True when there is ink to save. */
export function hasInk(strokes: Stroke[]): boolean {
  return strokes.some((s) => s.points.length > 0);
}

/**
 * Strokes from a pad of one size, shown in a pad of another (editing on a
 * tablet what was drawn on a phone): scaled uniformly and centred.
 */
export function fitStrokes(strokes: Stroke[], from: { width: number; height: number }, to: { width: number; height: number }): Stroke[] {
  if (!from.width || !from.height) return strokes;
  const k = Math.min(to.width / from.width, to.height / from.height);
  const dx = (to.width - from.width * k) / 2;
  const dy = (to.height - from.height * k) / 2;
  return strokes.map((s) => ({ ...s, size: s.size * k, points: s.points.map(([x, y, p]) => [x * k + dx, y * k + dy, p] as Point) }));
}
