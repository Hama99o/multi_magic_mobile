/**
 * Engine B's theme from our tokens, so the editor matches the read view in
 * both modes (SPEC §C2: UI face, 16/24 body, the read view's heading sizes).
 */
import type { EditorColors } from "./types";

/**
 * `fontScale` is the system font size (`useWindowDimensions().fontScale`).
 * The native editor sizes text in dp and never reads it (Android
 * `EditorEditTextConfiguration`: COMPLEX_UNIT_PX from `density`; the iOS editor
 * does not read Dynamic Type: only the library's viewer does), so at 200 % a
 * note's body stayed at 16 while everything around it doubled (device,
 * 2026-11-25, flow 97). Sizes and line heights are scaled here.
 */
export function engineTheme(colors: EditorColors, page: string = colors.ground, fontScale = 1) {
  const k = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const sz = (n: number) => Math.round(n * k);
  return {
    content: { backgroundColor: page },
    text: { color: colors.ink, fontSize: sz(16) },
    paragraph: { lineHeight: sz(24) },
    h1: { fontSize: sz(26), lineHeight: sz(32), fontWeight: "700" as const },
    h2: { fontSize: sz(21), lineHeight: sz(28), fontWeight: "700" as const },
    h3: { fontSize: sz(18), lineHeight: sz(25), fontWeight: "600" as const },
    blockquote: { borderLeftWidth: 3, borderColor: colors.border, paddingLeft: 12, color: colors.inkMuted },
    listMarker: { color: colors.inkMuted },
    taskCheckbox: { borderColor: colors.inkMuted, checked: { backgroundColor: colors.accent, borderColor: colors.accent, checkColor: colors.onAccent } },
    horizontalRule: { backgroundColor: colors.border, height: 1, marginVertical: 12 },
    link: { color: colors.accent },
    inlineCode: { backgroundColor: colors.surface },
    placeholder: { color: colors.inkMuted },
    // B paints a header row #F3F4F6 by default, under our light text in dark
    // mode (device, 2026-11-13): our tokens instead.
    table: { headerBackgroundColor: colors.surface, borderColor: colors.border, selectionColor: colors.accent, resizeHandleColor: colors.accent },
    toolbar: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      buttonColor: colors.ink,
      buttonActiveColor: colors.onAccent,
      buttonActiveBackgroundColor: colors.accent,
      buttonDisabledColor: colors.border,
      separatorColor: colors.border,
    },
  };
}
