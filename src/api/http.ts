/**
 * One axios instance that owns the base URL, the token, the device fingerprint,
 * error normalisation and the 401 path. No screen ever calls `fetch` or `axios`
 * directly.
 *
 * Shape lifted from `karwan-mobile/src/api/http.ts`. What is NOT lifted is its
 * auth scheme: Karwan uses a single opaque bearer token it mints itself, and
 * multi_magic uses devise-jwt with a device-fingerprint binding. Two differences
 * follow, and both are the kind that fail silently if got wrong.
 *
 * ── 1. THE TOKEN IS STORED VERBATIM, PREFIX INCLUDED ──────────────────────
 * multi_magic returns the JWT in the `Authorization` RESPONSE HEADER of
 * `POST /users/login`, already in the form `Bearer eyJ…`. The web client stores
 * that whole string and sends it back unchanged
 * (`multi_magic/app/javascript/services/auth.service.ts:19-23`).
 *
 * So this file must NOT add its own `Bearer ` prefix — Karwan's interceptor
 * does (`Authorization: \`Bearer ${token}\``) and copying that line would
 * produce `Bearer Bearer eyJ…`. The cable's verifier does `token.split.last`
 * (`application_cable/connection.rb:44`), which would strip only one of them.
 *
 * ── 2. EVERY REQUEST CARRIES THE DEVICE FINGERPRINT ───────────────────────
 * `jwt_revoked?` treats a fingerprint mismatch as a STOLEN TOKEN
 * (`user/jwt_dispatch.rb:27-39`). A request without the header is not a 401
 * about credentials — it is every request failing with nothing on screen to
 * suggest why. See `lib/fingerprint.ts`.
 */
import axios, { type AxiosError, type AxiosInstance } from "axios";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "@/config/env";
import { getDeviceFingerprint } from "@/lib/fingerprint";

export const BASE_URL = API_URL;

const TOKEN_KEY = "mm-auth-token";
/**
 * The signed-in address. Stored beside the token because the CABLE NEEDS IT:
 * `ApplicationCable::Connection#find_verified_user` looks the user up by
 * `email` and then checks the token against it, so a socket URL without the
 * address is rejected even with a perfectly good JWT.
 */
const EMAIL_KEY = "mm-auth-email";

/**
 * `undefined` = not yet read from the keystore. `null` = known to be signed
 * out. The distinction matters on sign-out: `setToken(null)` swallows a
 * keystore failure (deliberately — see below), and if this were a plain `null`
 * the next `loadToken` would treat it as "unknown", go back to the keystore,
 * and RESURRECT the token the server just rejected. The user would appear
 * signed in holding a credential that 401s on every request.
 */
let cachedToken: string | null | undefined;
let cachedEmail: string | null | undefined;

/**
 * The full `Authorization` header value, e.g. `"Bearer eyJ…"` — NOT the bare
 * JWT. Callers that need it for the cable query string want exactly this.
 */
export async function loadToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    // No keystore, or a corrupted entry. Treated as logged out — recoverable by
    // logging in, unlike crashing on launch.
    cachedToken = null;
  }
  return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // The in-memory cache still carries this launch, so a failed write costs a
    // re-login after a restart and nothing more.
  }
}

export async function loadSessionEmail(): Promise<string | null> {
  if (cachedEmail !== undefined) return cachedEmail;
  try {
    cachedEmail = await SecureStore.getItemAsync(EMAIL_KEY);
  } catch {
    cachedEmail = null;
  }
  return cachedEmail;
}

export async function setSessionEmail(email: string | null): Promise<void> {
  cachedEmail = email;
  try {
    if (email) await SecureStore.setItemAsync(EMAIL_KEY, email);
    else await SecureStore.deleteItemAsync(EMAIL_KEY);
  } catch {
    // Same trade as the token: this launch is covered by the cache.
  }
}

/**
 * WHY a session ended, as far as this client can tell.
 *
 * The server does not say: devise-jwt answers an expired token and a revoked
 * one with the same 401 and the same body. But the token carries `exp`, and
 * this client holds the token — so reading that one claim tells them apart:
 *
 *   - `exp` in the past  → the session simply ran out. devise.rb sets a year,
 *                          so on this server that is the rare case.
 *   - `exp` in the future → the server refused a LIVE token. That is
 *                          `jwt_revoked?`: the device fingerprint did not match
 *                          (`user/jwt_dispatch.rb:27-39`), or the allowlist row
 *                          is gone — signed out from another device, or the
 *                          account was deleted.
 *
 * Two sentences on the sign-in screen, because they ask for different things:
 * one is "carry on", the other is "check your other devices".
 */
export type SessionEndReason = "expired" | "revoked";

/**
 * Called on a 401 that ended a session, with the reason. Wired by the auth
 * store. NOT called for a 401 on a request that carried no token — see the
 * response interceptor.
 */
let onUnauthorized: ((reason: SessionEndReason) => void) | null = null;
export function setUnauthorizedHandler(fn: ((reason: SessionEndReason) => void) | null): void {
  onUnauthorized = fn;
}

/**
 * Told about every request's fate: reached (a response of ANY status) or not
 * reached (no response at all). Wired by the reachability store, injected the
 * same way as the 401 handler and for the same reason — this file is imported
 * by the stores and cannot import them back.
 */
let onReachability: ((reached: boolean) => void) | null = null;
export function setReachabilityHandler(fn: ((reached: boolean) => void) | null): void {
  onReachability = fn;
}

function decodeBase64Url(value: string): string {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  // `atob` is a global in Hermes (RN 0.74+); Node has it from 16 and Buffer
  // always. Guarded rather than assumed: a runtime without either must produce
  // a sentence, not a crash.
  const scope = globalThis as {
    atob?: (v: string) => string;
    Buffer?: { from: (v: string, enc: string) => { toString: (enc: string) => string } };
  };
  if (typeof scope.atob === "function") return scope.atob(b64);
  if (scope.Buffer) return scope.Buffer.from(b64, "base64").toString("binary");
  throw new Error("no base64 decoder");
}

/** Reads `exp` off the stored `Authorization` value. Never verifies — reading a
 *  claim needs no signature, and the server has already made its decision. */
export function sessionEndReason(authorization: string, now: number = Date.now()): SessionEndReason {
  try {
    const jwt = authorization.trim().split(/\s+/).pop() ?? "";
    const payload = jwt.split(".")[1];
    if (!payload) return "revoked";
    const claims = JSON.parse(decodeBase64Url(payload)) as { exp?: unknown };
    if (typeof claims.exp === "number" && claims.exp * 1000 < now) return "expired";
    return "revoked";
  } catch {
    // Unreadable is treated as revoked: the more careful of the two sentences.
    return "revoked";
  }
}

export const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  // 15s, not axios's default of none. A request with no timeout is a screen
  // that never resolves, and on this app that is indistinguishable from the
  // assistant simply thinking for a long time — which it legitimately does.
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

http.interceptors.request.use(async (config) => {
  const token = await loadToken();
  // Verbatim. The stored value already says "Bearer …" — see the header.
  if (token) config.headers.Authorization = token;

  // Bind every request to this install's fingerprint, or the server treats the
  // token as stolen.
  config.headers["X-Device-Fingerprint"] = await getDeviceFingerprint();
  return config;
});

/** The server's error sentence, when it sent one. */
export function apiErrorMessage(error: unknown): string | null {
  const data = (error as AxiosError | undefined)?.response?.data;
  if (typeof data !== "object" || data === null) return null;
  const record = data as { error?: unknown; message?: unknown };
  if (typeof record.error === "string") return record.error;
  if (typeof record.message === "string") return record.message;
  return null;
}

/**
 * "You are not signed in", rather than "we could not reach the server".
 *
 * They look identical to a `catch` and they are opposite problems — which is
 * how Karwan came to tell a user to CHECK THEIR CONNECTION about a 401 while
 * the connection was fine. Advice for a problem somebody does not have is worse
 * than none: they go and restart their router.
 */
export function isUnauthorized(error: unknown): boolean {
  return (error as AxiosError | undefined)?.response?.status === 401;
}

/**
 * Rate limited. `ai_controller.rb:5-9` caps questions at 15/minute and
 * 200/hour, and `sessions_controller.rb:9` caps logins at 10 per 3 minutes.
 *
 * Split out from the generic failure because it is the one failure where
 * RETRYING IS THE WRONG ADVICE and waiting is the right one. Without this it
 * falls through to "something went wrong, try again", which invites the user to
 * do the exact thing that keeps the limit closed.
 */
export function isRateLimited(error: unknown): boolean {
  return (error as AxiosError | undefined)?.response?.status === 429;
}

/**
 * The request reached nobody — no response at all, as opposed to a refusal.
 *
 * ── IT MUST BE AN AXIOS ERROR, and that check was missing ─────────────────
 * This used to be `Boolean(e && !e.response)`, which is true of ANY thrown
 * object that happens to lack a `.response` — including our own
 * `ApiShapeError`. Measured on a device: a parse failure made the chats screen
 * say "Could not reach MultiMagic" while the server had answered that exact
 * request **200 in 93 ms**.
 *
 * Which is precisely the failure this file's header complains about Karwan
 * shipping — telling somebody to check their connection when the connection is
 * fine — reproduced here by a guard that was too generous about what counts as
 * a network error. `isAxiosError` is the distinction: a transport failure comes
 * from the transport, and everything else is a bug in us.
 */
export function isNetworkFailure(error: unknown): boolean {
  const e = error as (AxiosError & { isAxiosError?: boolean }) | undefined;
  if (!e || typeof e !== "object") return false;
  if (e.isAxiosError !== true) return false;
  return !e.response;
}

/**
 * One line per failed request, in a shape a log scanner can find.
 *
 * `warn`, not `error`: a `console.error` raises a full-screen LogBox in a dev
 * build, which blanks the very screen being looked at.
 *
 * What it must NEVER contain: no Authorization header, no fingerprint, no
 * request body, no response body. Logs get pasted into findings files and
 * messages, and a token in one is a session anybody who reads it can use. The
 * fingerprint is not a secret, but it is the other half of the pair — printing
 * both together in a log would make that log enough to impersonate the device.
 */
function logApiFailure(error: AxiosError): void {
  if (!__DEV__) return;
  const method = (error.config?.method ?? "?").toUpperCase();
  const path = error.config?.url ?? "?";
  const status = error.response?.status;
  console.warn(`[mm:api] ${method} ${path} -> ${status ?? "network"}`);
}

/**
 * How long a 429 asks us to wait, in seconds — or null when it did not say.
 *
 * Two shapes on this server. Rack::Attack (logins, resets, signups) sends a
 * `Retry-After` header AND `{ retry_after }` in the body
 * (`config/initializers/rack_attack.rb:63-67`). Rails' own `rate_limit` on
 * `ai#show` — the 15/minute and 200/hour caps — sends `head :too_many_requests`
 * and nothing else. A caller that gets null knows the limit only from the
 * controller's comment, which is why `LIMITS` in ai.ts carries both numbers.
 */
export function retryAfterSeconds(error: unknown): number | null {
  const e = error as AxiosError<{ retry_after?: unknown }> | undefined;
  const header = e?.response?.headers?.["retry-after"];
  const fromHeader = typeof header === "string" ? Number(header) : typeof header === "number" ? header : NaN;
  if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader;
  const body = e?.response?.data?.retry_after;
  if (typeof body === "number" && Number.isFinite(body) && body > 0) return body;
  return null;
}

/**
 * The transport is DOWN — as opposed to merely slow.
 *
 * Narrower than `isNetworkFailure`, on purpose: that one is the sentence
 * chooser and rightly counts a timeout as "could not reach". This one drives
 * the offline banner, and a 10 MB upload timing out on a slow connection is
 * not the app being offline — flipping the composer off for it would be a lie
 * the probe then has to undo. So: an axios error, no response, and not a
 * timeout.
 */
function isTransportDown(error: AxiosError): boolean {
  if (error.isAxiosError !== true || error.response) return false;
  return error.code !== "ECONNABORTED" && error.code !== "ETIMEDOUT";
}

http.interceptors.response.use(
  (res) => {
    onReachability?.(true);
    return res;
  },
  async (error: AxiosError) => {
    logApiFailure(error);

    // A 4xx or 5xx is a server that ANSWERED; only silence is "not reached".
    if (isTransportDown(error)) onReachability?.(false);
    else if (error.response) onReachability?.(true);

    if (error.response?.status === 401) {
      // ONLY when this request carried a session. `POST /users/login` with a
      // wrong password is also a 401 and is not a session ending — before
      // this guard it reached the handler too, which tore down a cable that
      // was not up and, now that the handler carries a reason, would have told
      // somebody who mistyped their password that their session had expired.
      const headers = error.config?.headers as Record<string, unknown> | undefined;
      const carried = headers?.Authorization ?? headers?.authorization;
      if (typeof carried === "string" && carried.trim() !== "") {
        const reason = sessionEndReason(carried);
        // Clear FIRST, then notify. The other order leaves a window in which a
        // retry re-sends the token the server just rejected.
        await setToken(null);
        onUnauthorized?.(reason);
      }
    }
    return Promise.reject(error);
  },
);

/** Test seam — back to "not yet read", not to "signed out". */
export function __resetTokenCache(): void {
  cachedToken = undefined;
  cachedEmail = undefined;
}
