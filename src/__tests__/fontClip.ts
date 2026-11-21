/**
 * FONT SCALE IN JEST (hidden-criteria sweeps, 2026-11-21): every rendered Text whose line height,
 * scaled the way the platform scales it (`fontScale`, capped by `maxFontSizeMultiplier`, none when
 * `allowFontScaling` is false), overflows the nearest box with a fixed `height` around it.
 * No layout engine here: this proves the arithmetic, a device at 200 % proves the pixels.
 */
import { StyleSheet } from "react-native";

export type Host = { type: unknown; props: Record<string, unknown>; parent: Host | null; children: (Host | string)[] };

export function clipped(root: Host, fontScale: number): string[] {
  const out: string[] = [];
  const walk = (n: Host | string) => {
    if (typeof n === "string") return;
    if (n.type === "Text") {
      const own = StyleSheet.flatten(n.props.style as never) as { lineHeight?: number; fontSize?: number; height?: number } | undefined;
      // A line is at least the glyphs' own height: a lineHeight under the font size (the amount
      // keypad inherited 22 under a 26 font) does not make the glyphs smaller, they spill past it.
      const glyphs = Math.ceil((own?.fontSize ?? 14) * 1.2);
      const line = Math.max(own?.lineHeight ?? 0, glyphs);
      const cap = n.props.allowFontScaling === false ? 1 : Math.min(fontScale, (n.props.maxFontSizeMultiplier as number | undefined) ?? Infinity);
      let box: number | undefined = own?.height;
      for (let p = n.parent; box === undefined && p; p = p.parent) {
        const h = (StyleSheet.flatten(p.props.style as never) as { height?: unknown } | undefined)?.height;
        if (typeof h === "number") box = h;
      }
      const text = n.children.filter((c) => typeof c === "string").join("");
      if (box !== undefined && line * cap > box) out.push(`"${text}": ${line * cap} in ${box}`);
    }
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}
