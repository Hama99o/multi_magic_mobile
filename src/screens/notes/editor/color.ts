/**
 * Reading the web's stored colours (hex, rgb(), hsl()) well enough to pick a
 * readable text colour on top of them. Pure; props-only parts use it.
 */

type RGB = [number, number, number];

function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** [r, g, b] in 0–255, or null for anything this does not read (names, variables). */
export function parseColor(css: string): RGB | null {
  const c = css.trim().toLowerCase();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c);
  if (m) {
    const hex = m[1].length === 3 ? m[1].split("").map((x) => x + x).join("") : m[1];
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(c);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(c);
  if (m) return hslToRgb(Number(m[1]) % 360, Number(m[2]) / 100, Number(m[3]) / 100);
  return null;
}

function luminance([r, g, b]: RGB): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** WCAG contrast ratio of two CSS colours (1 when either cannot be read). */
export function contrastRatio(a: string, b: string): number {
  const x = parseColor(a);
  const y = parseColor(b);
  return x && y ? contrast(x, y) : 1;
}

/** Of two text colours, the one that reads better on `background`; `first` when unsure. */
export function readableInk(background: string, first: string, second: string): string {
  const bg = parseColor(background);
  const a = parseColor(first);
  const b = parseColor(second);
  if (!bg || !a || !b) return first;
  return contrast(bg, b) > contrast(bg, a) ? second : first;
}
