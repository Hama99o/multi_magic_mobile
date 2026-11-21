/**
 * THE SIX SCRIPT FONTS OF A TYPED SIGNATURE, bundled (parity audit §2.1).
 *
 * The web loads them from Google Fonts at run time; a phone has them in the
 * app (`assets/fonts/signatures`, SIL OFL 1.1, the same files the server
 * draws with, `multi_magic` `vendor/fonts/signatures`), so the preview is the
 * picture the server will make, and it works offline.
 *
 * `css` is the value the web stores in `font` ("'Caveat', cursive"), so a
 * signature typed on the phone opens in the same face on the laptop, and the
 * server's renderer reads the family off its first name.
 *
 * Loaded at run time by `expo-font` (already in the native build): no new
 * native code, no build spent.
 */
import { useFonts } from "expo-font";

export interface SignatureFont {
  /** What the chip says. */
  label: string;
  /** The family name registered with expo-font. */
  family: string;
  /** What is saved in `font`, the web's value. */
  css: string;
}

export const SIGNATURE_FONTS: readonly SignatureFont[] = [
  { label: "Caveat", family: "SigCaveat", css: "'Caveat', cursive" },
  { label: "Dancing", family: "SigDancingScript", css: "'Dancing Script', cursive" },
  { label: "Pacifico", family: "SigPacifico", css: "'Pacifico', cursive" },
  { label: "Sacramento", family: "SigSacramento", css: "'Sacramento', cursive" },
  { label: "Great Vibes", family: "SigGreatVibes", css: "'Great Vibes', cursive" },
  { label: "Allura", family: "SigAllura", css: "'Allura', cursive" },
];

/** The saved `font` value → our font; Caveat when unknown, as the server does. */
export function fontFor(css: string | null | undefined): SignatureFont {
  const first = (css ?? "").split(",")[0].replace(/['"]/g, "").trim().toLowerCase();
  return SIGNATURE_FONTS.find((f) => f.css.split(",")[0].replace(/['"]/g, "").trim().toLowerCase() === first) ?? SIGNATURE_FONTS[0];
}

/** True once the six are registered (or failed: the system face stands in). */
export function useSignatureFonts(): boolean {
  const [loaded, error] = useFonts({
    SigCaveat: require("../../../assets/fonts/signatures/Caveat.ttf"),
    SigDancingScript: require("../../../assets/fonts/signatures/DancingScript.ttf"),
    SigPacifico: require("../../../assets/fonts/signatures/Pacifico.ttf"),
    SigSacramento: require("../../../assets/fonts/signatures/Sacramento.ttf"),
    SigGreatVibes: require("../../../assets/fonts/signatures/GreatVibes.ttf"),
    SigAllura: require("../../../assets/fonts/signatures/Allura.ttf"),
  });
  return loaded || Boolean(error);
}
