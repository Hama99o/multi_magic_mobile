/**
 * THE DEVICE FINGERPRINT — the single value that decides whether this app can
 * talk to multi_magic at all.
 *
 * ── What the server does with it ──────────────────────────────────────────
 * `multi_magic/app/models/user/jwt_dispatch.rb:27-39` overrides
 * `jwt_revoked?` to compare the fingerprint stored against the JWT with the one
 * on the current request:
 *
 *     stored_fp = jwt.device_fingerprint
 *     request_fp = Thread.current[:device_fingerprint].to_s
 *     return false if stored_fp.blank?   # legacy token, allowed
 *     stored_fp != request_fp            # mismatch => REVOKED
 *
 * So a mismatch is not a 401 about a bad password. It is the token being
 * treated as STOLEN — every request rejected, with nothing on screen to
 * suggest the fingerprint is the reason. That is why this file is the first
 * thing built and the first thing tested.
 *
 * It is sent two ways, because the transports differ:
 *   - HTTP  : the `X-Device-Fingerprint` header (see `api/http.ts`)
 *   - SOCKET: the `fp` QUERY PARAMETER — a WebSocket upgrade cannot carry a
 *             custom header (`application_cable/connection.rb:19-28` says so
 *             in its own comment, and says that not doing this rejected every
 *             browser connection as a stolen token).
 *
 * ── Why this is a random UUID and not a derived fingerprint ──────────────
 * The web computes its value from `navigator.userAgent`, the language, the
 * timezone, `screen.width x height x colorDepth`, `hardwareConcurrency`,
 * `deviceMemory` and an offscreen **canvas render**, hashed together
 * (`multi_magic/app/javascript/lib/fingerprint.ts`). We do not port that, and
 * on a phone there is nothing to port it FROM — no canvas, no `navigator`.
 *
 * What the server actually needs is a value that is STABLE and DISTINCT, not
 * one that is DERIVED: `jwt_revoked?` only ever compares it for equality. A
 * random UUID in the keystore is both, and it is better than a derived value
 * here — an OS update that changed the user agent, or a display-size setting,
 * would change a derived fingerprint and lock someone out of their own account
 * with nothing on screen to explain why.
 *
 * NOTE, corrected 2026-09-18: an earlier version of this comment repeated the
 * web file's own header, which says the value "is intentionally NOT a secret"
 * and that "the server stores a SHA-256 hash of this value". **That second
 * claim is false** — `db/schema.rb:144` types
 * `allowlisted_jwts.device_fingerprint` as a plain string; only
 * `trusted_devices.fingerprint_digest` is hashed. So this file does not rest
 * on how the server stores the value, because we cannot claim that. What makes
 * it safe on OUR side is SecureStore, which is under this app's control.
 *
 * The general lesson, worth keeping: a docstring is a claim about code, not the
 * code. That header says "random"; the function computes a canvas hash.
 *
 * ── Two rules ─────────────────────────────────────────────────────────────
 * 1. STABLE ACROSS RESTARTS. Hence SecureStore, not memory.
 * 2. NEVER CLEARED ON LOGOUT. Clearing it mints a new value on the next
 *    launch, which the server compares against the one bound to the reissued
 *    token — a re-authentication cycle for someone who signed out and back in
 *    on the same device. `signOut` in `api/auth.ts` clears the token and
 *    deliberately leaves this alone.
 */
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

const FINGERPRINT_KEY = "mm_device_fp";

/**
 * Cached for the life of the process. Every request reads this, and hitting the
 * keystore on each one would put a native round-trip in front of all traffic.
 */
let cached: string | null = null;

/**
 * In-flight generation, so two requests racing at launch cannot each mint a
 * fingerprint and have the second overwrite the first. That would not merely be
 * untidy: the token issued against the first value would be revoked by the
 * second, which is the exact lockout this file exists to prevent.
 */
let pending: Promise<string> | null = null;

export async function getDeviceFingerprint(): Promise<string> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    try {
      const stored = await SecureStore.getItemAsync(FINGERPRINT_KEY);
      if (stored) {
        cached = stored;
        return stored;
      }
    } catch {
      // A device with no keystore, or a corrupted entry. Fall through and mint
      // a fresh one — a new fingerprint costs a re-login, which is recoverable.
      // Crashing on launch is not.
    }

    const fresh = Crypto.randomUUID();
    try {
      await SecureStore.setItemAsync(FINGERPRINT_KEY, fresh);
    } catch {
      // The in-memory cache carries this launch. A failed write costs a
      // re-login after a restart and nothing more.
    }
    cached = fresh;
    return fresh;
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

/**
 * Test seam only. Deliberately NOT called by `signOut` — see rule 2 above.
 */
export function __resetFingerprintCache(): void {
  cached = null;
  pending = null;
}
