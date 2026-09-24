/**
 * "Cover the parent", written out.
 *
 * NOT `StyleSheet.absoluteFillObject` (removed in the React Native SDK 57
 * ships: spreading the missing name left every scrim with no size, so no tap
 * outside a sheet could close it, found on the owner's phone 2026-09-24), and
 * NOT a spread of `StyleSheet.absoluteFill` (a registered style on SDK 54, which
 * the types refuse to spread). A plain object means the same thing on every
 * version. `.eslintrc.js` points here.
 */
export const FILL = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;
