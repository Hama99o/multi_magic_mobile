/**
 * FEATURE FLAGS — plain constants, deliberately.
 *
 * Not read from a server: an app that asks the server whether a feature is on
 * cannot tell "off" from "the network is down", and those are opposite answers
 * (the same reasoning as `ACCOUNT_DELETION_AVAILABLE` in api/account.ts). A
 * flag flips in a commit, with the reason beside it.
 */

/**
 * Read an answer aloud — `docs/READ_ALOUD_PROPOSAL.md`.
 *
 * ON since 2026-09-19. The flag was holding one question — which voice — and
 * Hamma9900 answered a different one: *"I can't see the speak button, for a
 * response we should have a button to not read but to listen it… it is
 * important."* A feature he cannot find is not waiting for his ear, so it
 * ships with the default voice and he changes it afterwards, which is one
 * setting rather than a rebuild.
 *
 * What he gets depends on where his phone is pointed, and both paths work:
 * the server's voice from `GET /api/v1/ai/messages/:id/speech` where that
 * route exists, and the phone's own voice — saying so on screen — where it
 * does not. See `fallsBackToDevice` in `api/speech.ts`; the production route
 * was not deployed when this flipped, so the phone's voice is what he will
 * actually hear tonight.
 *
 * `expo-audio` and `expo-speech` are both in Expo Go's bundled modules for
 * SDK 54 (`expo/bundledNativeModules.json`) and neither needs a config
 * plugin, so this renders in Expo Go as well as in a dev build. If either is
 * somehow missing the control is ABSENT rather than broken — `supported` in
 * `stores/readAloud.store.ts` — which is the same rule the composer's mic
 * follows.
 */
export const READ_ALOUD_ENABLED = true;

/**
 * Edit a note on the phone — phase 3, `docs/design/notes/SPEC.md` §C, §H.
 *
 * ON IN DEV BUILDS ONLY (2026-11-13). The editor runs on engine B (plan §11,
 * "B with conditions"); it ships to a store build only after its own device
 * QA (keyboard never hides the caret, undo, drafts, conflicts, RTL, dark,
 * 360/800) and the owner's check of the Pashto keyboard, Samsung keyboard and
 * iOS dictation. Off, the note screen is the read view it was in phase 2.
 */
export const NOTES_EDITOR_ENABLED: boolean = __DEV__;
