/**
 * NativeWind is here for LAYOUT, SPACING and TYPE — not for colour.
 *
 * Colour comes from `useTokens()` (src/theme/tokens.ts), the single file the
 * palette lives in. Karwan keeps colour out of Tailwind because its three role
 * themes need one token name to resolve differently per role; this app has no
 * roles, but the reason survives the simplification: light and dark still need
 * one name with two resolutions, and a `dark:` variant on every coloured
 * element is the version that goes wrong one element at a time.
 *
 * LTR only. Karwan bans physical `pl-`/`pr-` in favour of logical `ps-`/`pe-`
 * because it ships RTL; this app is English and LTR, so that ban is NOT carried
 * over — it would be cargo. Physical utilities are fine here.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      spacing: {
        // Touch-target floor, as a named token so a screen asks for
        // `min-h-touch` rather than remembering the number.
        touch: "48px",
      },
      maxWidth: {
        // §8 of docs/design/IDENTITY.md: at 800 dp the conversation takes a
        // measure and centres. A full-width line of serif text on a tablet is
        // unreadable, and that is the one place a wide screen needs a decision
        // rather than a resize.
        measure: "640px",
      },
    },
  },
  plugins: [],
};
