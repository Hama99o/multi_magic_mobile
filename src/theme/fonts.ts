/**
 * FONT FAMILIES, RESOLVED PER PLATFORM — because "serif" is not a font on iOS.
 *
 * `fontFamily: "serif"` and `fontFamily: "monospace"` are ANDROID generic
 * family names: Android maps them to Noto Serif and Droid Sans Mono. iOS has no
 * generic names at all — `fontFamily` must be a family that is actually
 * installed — so React Native logs "Unrecognized font family 'serif'" once and
 * falls back to San Francisco. Silently, in the sense that matters: nothing
 * throws, the text renders, and it renders in the wrong face.
 *
 * For this app that is not a nit. `IDENTITY.md` §2 makes the serif the
 * argument: the assistant's answer is not in a bubble because it is a paragraph
 * drawn from the user's own records, and the serif is what makes a paragraph
 * read as a document rather than a text message. On iOS, before this file, that
 * argument did not render — and no test could see it, because a font family is
 * a string that is right on one platform and a warning on the other.
 *
 * Georgia and Menlo have shipped on every iOS since the first iPhone, so nothing
 * is bundled and nothing loads. The generic names stay for any platform that
 * understands them.
 */
import { Platform } from "react-native";

export type FontKind = "serif" | "mono";

/** Pure, so a test can ask about a platform it is not running on. */
export function familyFor(kind: FontKind, os: string = Platform.OS): string {
  if (kind === "serif") return os === "ios" ? "Georgia" : "serif";
  return os === "ios" ? "Menlo" : "monospace";
}

export const FONTS = {
  serif: familyFor("serif"),
  mono: familyFor("mono"),
} as const;
