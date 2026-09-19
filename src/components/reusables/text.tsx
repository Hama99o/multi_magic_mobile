/**
 * The ONLY text component. Nothing imports `Text` from react-native directly.
 *
 * Two rules it makes unforgettable rather than remembered:
 *
 * 1. **Colour comes from tokens.** No screen writes a hex value, so light and
 *    dark stay in step by construction.
 * 2. **`variant="answer"` is the SERIF**, and that is the argument in
 *    IDENTITY.md §2 rather than a flourish: the assistant's reply is not in a
 *    bubble, because these are paragraphs drawn from the user's own notes and
 *    money. A serif is what makes a paragraph read as a document rather than a
 *    text message, and it is why the Claude app sets its answers in one.
 *
 *    The family itself comes from `theme/fonts.ts`, because `"serif"` is a
 *    font on Android and a warning on iOS — where it fell back to San
 *    Francisco and the whole argument silently did not render.
 *
 * `textAlign` is left unset. RN resolves it from the layout direction, and this
 * app is LTR throughout — Karwan's RTL machinery is deliberately not carried.
 */
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";
import { useColors } from "@/hooks/useColors";
import { FONTS } from "@/theme/fonts";

export type TextTone = "default" | "muted" | "accent" | "onAccent" | "danger";
export type TextVariant = "body" | "answer" | "label" | "title" | "caption";

export type TextProps = RNTextProps & {
  tone?: TextTone;
  variant?: TextVariant;
};

const VARIANTS: Record<TextVariant, TextStyle> = {
  title: { fontSize: 26, lineHeight: 32, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 22 },
  /**
   * The assistant's answer. `lineHeight` is 1.6x rather than the 1.4x the UI
   * uses: these are the longest passages in the app and the only ones somebody
   * reads rather than scans.
   */
  answer: { fontSize: 17, lineHeight: 27, fontFamily: FONTS.serif },
  label: { fontSize: 14, lineHeight: 18, fontWeight: "600" },
  caption: { fontSize: 13, lineHeight: 17 },
};

export function Text({ tone = "default", variant = "body", style, ...rest }: TextProps) {
  const colors = useColors();
  const color = {
    default: colors.ink,
    muted: colors.inkMuted,
    accent: colors.accent,
    onAccent: colors.onAccent,
    danger: colors.danger,
  }[tone];

  return <RNText {...rest} style={[VARIANTS[variant], { color }, style]} />;
}
