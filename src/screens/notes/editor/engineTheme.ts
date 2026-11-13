/**
 * Engine B's theme from our tokens, so the editor matches the read view in
 * both modes (SPEC §C2: UI face, 16/24 body, the read view's heading sizes).
 */
import type { EditorColors } from "./types";

export function engineTheme(colors: EditorColors, page: string = colors.ground) {
  return {
    content: { backgroundColor: page },
    text: { color: colors.ink, fontSize: 16 },
    paragraph: { lineHeight: 24 },
    h1: { fontSize: 26, lineHeight: 32, fontWeight: "700" as const },
    h2: { fontSize: 21, lineHeight: 28, fontWeight: "700" as const },
    h3: { fontSize: 18, lineHeight: 25, fontWeight: "600" as const },
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
