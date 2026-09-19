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
 * OFF until Hamma9900 has listened to the voice on a phone. The whole feature
 * is built and tested behind this constant: the endpoint
 * (`GET /api/v1/ai/messages/:id/speech`) is live, the store plays the server's
 * audio and falls back to the device voice saying so, and the control renders
 * under every assistant answer the moment this is `true`. Nothing else has to
 * change — which is the point of building it flagged rather than not at all.
 */
export const READ_ALOUD_ENABLED = false;
