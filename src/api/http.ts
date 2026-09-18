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

/** Called on a 401. Wired by the auth store. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
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

/** The request reached nobody — no response at all, as opposed to a refusal. */
export function isNetworkFailure(error: unknown): boolean {
  const e = error as AxiosError | undefined;
  return Boolean(e && !e.response);
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

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    logApiFailure(error);

    if (error.response?.status === 401) {
      // Clear FIRST, then notify. The other order leaves a window in which a
      // retry re-sends the token the server just rejected.
      await setToken(null);
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

/** Test seam — back to "not yet read", not to "signed out". */
export function __resetTokenCache(): void {
  cachedToken = undefined;
  cachedEmail = undefined;
}
