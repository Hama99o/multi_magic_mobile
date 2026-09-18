/**
 * Turning a caught error into a sentence that is TRUE.
 *
 * ── THE BUG THAT CAUSED THIS FILE ─────────────────────────────────────────
 * On 2026-09-18, on a device, the chats list rendered **"Could not reach
 * MultiMagic."** while the server answered that exact request **200 in 93 ms**.
 *
 * Nothing was wrong with the network. `message_serializer.rb` sends
 * `role: null` for every message a person writes — only assistant turns have
 * one — and `parseMessage` read it with `str()`, which throws. The resulting
 * `ApiShapeError` has no `.response`, and `isNetworkFailure` is
 * `Boolean(e && !e.response)`, so a parsing bug in our own code was reported as
 * an unreachable server.
 *
 * That is the exact failure `http.ts`'s own header records Karwan shipping:
 * "Karwan came to tell a user to CHECK THEIR CONNECTION about a 401 while the
 * connection was fine. Advice for a problem somebody does not have is worse
 * than none: they go and restart their router."
 *
 * ── WHY THIS LIVES HERE AND NOT IN `http.ts` ──────────────────────────────
 * The real repair is for `isNetworkFailure` to exclude `ApiShapeError`, and
 * `http.ts` is frozen to both sessions — raised with Hamma9901 rather than
 * taken. Until then every screen this session owns classifies through here, so
 * no screen of ours can blame the network for our own bug.
 */
import { ApiShapeError } from "./parse";
import { apiErrorMessage, isNetworkFailure, isRateLimited, isUnauthorized } from "./http";

/**
 * A shape error is OUR bug, and the sentence says so.
 *
 * Telling somebody their connection failed sends them to restart a router; this
 * sends them nowhere, which is correct, because there is nothing they can do
 * and the fault is ours. It is deliberately not phrased as "try again" either —
 * retrying a payload we cannot parse produces the same payload.
 */
const UNREADABLE =
  "MultiMagic sent something this app could not read. That is a bug in the app, not your connection.";

export function failureMessage(error: unknown, fallback: string): string {
  // FIRST, before the network check — the ordering is the whole point.
  if (error instanceof ApiShapeError) return UNREADABLE;
  if (isNetworkFailure(error)) return "Could not reach MultiMagic.";
  if (isRateLimited(error)) return "Too many requests just now. Give it a minute.";
  // A 401 has already signed the user out through the interceptor; saying
  // anything else about it here would be describing a screen they have left.
  if (isUnauthorized(error)) return "Your session ended. Sign in again.";
  return apiErrorMessage(error) ?? fallback;
}

/** True when the failure is ours rather than the network's or the server's —
 *  so a screen can offer something other than "Try again", which cannot help. */
export function isOurBug(error: unknown): boolean {
  return error instanceof ApiShapeError;
}
