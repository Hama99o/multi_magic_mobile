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
 * ── Why this is a random UUID and not a device fingerprint ────────────────
 * The web computes one from canvas rendering, user agent, screen geometry and
 * hardware concurrency (`multi_magic/app/javascript/lib/fingerprint.ts`). We do
 * NOT port that, and the web file itself explains why we don't have to:
 *
 *     "This is intentionally NOT a secret — its purpose is to differentiate
 *      browsers/devices, not to authenticate users. The server stores a
 *      SHA-256 hash of this value."
 *
 * The server needs it STABLE and DISTINCT. It does not need it DERIVED. A
 * random UUID persisted once is both, and it is better than a derived value on
 * a phone: an OS update that changes the user agent, or a display-size setting,
 * would change a derived fingerprint and lock the user out of their own account
 * with no way to understand why.
 *
 * ── Two rules, both from the web's own comments ───────────────────────────
 * 1. STABLE ACROSS RESTARTS. Hence SecureStore, not memory.
 * 2. NEVER CLEARED ON LOGOUT. The web says: "The fingerprint is intentionally
 *    NOT cleared on logout — doing so would cause a re-authentication cycle if
 *    a user clears and re-logs in the same browser." `signOut` in `api/auth.ts`
 *    clears the token and deliberately leaves this alone.
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
