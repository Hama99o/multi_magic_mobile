/**
 * The transport, exercised THROUGH its interceptors.
 *
 * axios-mock-adapter rather than `jest.spyOn(http, "get")`: spying replaces the
 * method and the interceptors never run, so a test written that way would pass
 * with the Authorization header and the fingerprint both absent — which are the
 * two things this file exists to get right.
 */
import i18n from "@/i18n";
import MockAdapter from "axios-mock-adapter";
import * as SecureStore from "expo-secure-store";
import {
  apiErrorMessage,
  __resetTokenCache, http, isNetworkFailure, isRateLimited, isUnauthorized,
  loadSessionEmail, loadToken, retryAfterSeconds, sessionEndReason, setReachabilityHandler,
  setSessionEmail, setToken, setTrustToken, setUnauthorizedHandler,
} from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { ApiShapeError } from "../parse";

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(http);
  jest.clearAllMocks();
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
  setUnauthorizedHandler(null);
  setReachabilityHandler(null);
});

/** A JWT with the given `exp`, shaped as devise-jwt hands it back. */
function bearer(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ jti: "abc", exp })).toString("base64url");
  return `Bearer eyJhbGciOiJIUzI1NiJ9.${payload}.c2ln`;
}
const IN_AN_HOUR = Math.floor(Date.now() / 1000) + 3600;
const AN_HOUR_AGO = Math.floor(Date.now() / 1000) - 3600;

afterEach(() => {
  mock.restore();
});

describe("the request interceptor", () => {
  // ── THE DOUBLE-BEARER TRAP ────────────────────────────────────────────────
  //
  // multi_magic returns the JWT already prefixed, and the web stores that whole
  // string. Karwan's interceptor — which this file's shape is lifted from —
  // writes `Bearer ${token}`. Copying that line produces "Bearer Bearer eyJ…",
  // and the cable's `token.split.last` strips only one of the two.
  it("sends the stored Authorization value VERBATIM, adding no prefix", async () => {
    await setToken("Bearer eyJhbGciOi.payload.sig");
    mock.onGet("/api/v1/ai/conversation").reply(200, { id: 7 });

    await http.get("/api/v1/ai/conversation");

    expect(mock.history.get[0].headers?.Authorization).toBe("Bearer eyJhbGciOi.payload.sig");
  });

  // BEFORE sign-in the server can only learn the reader's language from this
  // header (multi_magic `reader_locale`, 4c6b728), and the app sent none, so a
  // French reader's sign-in and reset errors came back in English. Read per
  // request: switching language changes the next request, not the next launch.
  it("sends the APP's language on every request, and follows a switch", async () => {
    mock.onGet("/anything").reply(200, {});
    await i18n.changeLanguage("fr");
    try {
      await http.get("/anything");
      expect(mock.history.get[0].headers?.["Accept-Language"]).toBe("fr");
      await i18n.changeLanguage("en");
      await http.get("/anything");
      expect(mock.history.get[1].headers?.["Accept-Language"]).toBe("en");
    } finally {
      await i18n.changeLanguage("en");
    }
  });

  it("sends the device fingerprint on EVERY request", async () => {
    await setToken("Bearer t");
    mock.onGet("/anything").reply(200, {});

    await http.get("/anything");

    // Without this header the server compares the stored fingerprint against an
    // empty one and rejects the token as stolen — not a 401 about credentials.
    expect(mock.history.get[0].headers?.["X-Device-Fingerprint"]).toBe(
      "11111111-2222-3333-4444-555555555555",
    );
  });

  /**
   * THE LINK THAT MAKES "TRUST THIS DEVICE" MEAN ANYTHING.
   *
   * The trust used to be storable and unusable: `trusted_devices#create`
   * answered with a `Set-Cookie` and this client keeps no cookie jar, so the
   * button reported success and the next sign-in asked for a code anyway. The
   * token now comes back in the body and rides this header — and if it stopped
   * doing so, nothing else in the app would look any different. That silence
   * is why this is asserted here rather than left to the screen's tests.
   */
  it("sends the trusted-device token on the login request", async () => {
    await setTrustToken("trust-abc");
    mock.onPost("/users/login").reply(200, {});

    await http.post("/users/login", {});

    expect(mock.history.post[0].headers?.["X-Trusted-Device"]).toBe("trust-abc");
  });

  /**
   * ONLY on login. It is the one request that reads it, and a device
   * credential on every call is a device credential in every log and proxy
   * between here and the server, for nothing.
   */
  it("sends it nowhere else", async () => {
    await setTrustToken("trust-abc");
    await setToken("Bearer t");
    mock.onGet("/anything").reply(200, {});

    await http.get("/anything");

    expect(mock.history.get[0].headers?.["X-Trusted-Device"]).toBeUndefined();
  });

  it("sends no such header when this phone has never been trusted", async () => {
    mock.onPost("/users/login").reply(200, {});

    await http.post("/users/login", {});

    expect(mock.history.post[0].headers?.["X-Trusted-Device"]).toBeUndefined();
  });

  it("sends the fingerprint even when signed out", async () => {
    mock.onPost("/users/login").reply(200, {});

    await http.post("/users/login", {});

    expect(mock.history.post[0].headers?.["X-Device-Fingerprint"]).toBeTruthy();
    expect(mock.history.post[0].headers?.Authorization).toBeUndefined();
  });
});

describe("the 401 path", () => {
  it("clears the token BEFORE telling anyone, so no retry resends it", async () => {
    await setToken("Bearer stale");
    const order: string[] = [];
    setUnauthorizedHandler(() => {
      order.push("notified");
    });
    const realDelete = SecureStore.deleteItemAsync as jest.Mock;
    const passThrough = realDelete.getMockImplementation();
    realDelete.mockImplementation(async (k: string) => {
      order.push("cleared");
      await passThrough?.(k);
    });
    mock.onGet("/guarded").reply(401, { error: "unauthorized" });

    await expect(http.get("/guarded")).rejects.toBeDefined();

    expect(order).toEqual(["cleared", "notified"]);
    expect(await loadToken()).toBeNull();
  });

  // ── THE RESURRECTION ──────────────────────────────────────────────────────
  //
  // `setToken(null)` swallows a keystore failure on purpose — a failed write
  // should cost a re-login, not a crash. But that means the stale value is
  // still ON DISK. If the in-memory cache treated "null" as "not yet read",
  // the next call would go back to the keystore and hand back the token the
  // server just rejected, leaving the user apparently signed in and 401ing on
  // every request.
  it("stays signed out when the keystore delete fails", async () => {
    await setToken("Bearer stale");
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error("keystore down"));

    await setToken(null);

    expect(await loadToken()).toBeNull();
  });

  // ── THE LOGIN'S OWN 401 IS NOT A SESSION ENDING ──────────────────────────
  //
  // A wrong password is a 401 too. Before this guard it reached the handler,
  // which tore down a cable that was never up — and once the handler carried a
  // reason, would have told somebody who mistyped their password that their
  // session had expired.
  it("ignores a 401 on a request that carried no token", async () => {
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    mock.onPost("/users/login").reply(401, { error: "Invalid Email or password." });

    await expect(http.post("/users/login", {})).rejects.toBeDefined();

    expect(handler).not.toHaveBeenCalled();
  });

  // ── AND NEITHER IS A 401 ABOUT A PASSWORD THE REQUEST ITSELF CARRIED ─────
  //
  // `DELETE /api/v1/users/me` sends the password on purpose, because a valid
  // token is not evidence that the OWNER is the one pressing delete. So a
  // typo there is a 401 on a request that ALSO carried a good token, and the
  // old guard — token present, therefore session over — signed the person out
  // of the most consequential screen in the app and told them their session
  // had expired. It had not. And the screen's own "that password is not
  // right" was set on a view being replaced as it set it, so the true reason
  // never reached the screen either.
  //
  // `docs/design/profile/SPEC.md` §0.2 is this class: the server answers a
  // wrong `current_password` with 422 precisely so the client cannot make
  // this mistake. Deletion answers 401, so the client has to not make it.
  it("does not end the session on a 401 for a password the request carried", async () => {
    await setToken(bearer(IN_AN_HOUR));
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    mock.onDelete("/api/v1/users/me").reply(401, { error: "Password is incorrect" });

    await expect(
      http.delete("/api/v1/users/me", { data: { password: "wrong" } }),
    ).rejects.toBeDefined();

    expect(handler).not.toHaveBeenCalled();
    // And the token SURVIVES: the person is still signed in, still on the
    // screen, and free to try the password again.
    expect(await loadToken()).toBe(bearer(IN_AN_HOUR));
  });

  it("still ends the session on a 401 for a request with no password in it", async () => {
    await setToken(bearer(IN_AN_HOUR));
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    mock.onDelete("/api/v1/users/me").reply(401);

    await expect(http.delete("/api/v1/users/me", { data: { confirm: true } })).rejects.toBeDefined();

    // The exemption is about the password, not about the endpoint — otherwise
    // a genuinely dead session on this route would leave the app signed in
    // and failing every request.
    expect(handler).toHaveBeenCalledWith("revoked");
    expect(await loadToken()).toBeNull();
  });

  it("says REVOKED when a live token is refused — the fingerprint, or another device", async () => {
    await setToken(bearer(IN_AN_HOUR));
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    mock.onGet("/guarded").reply(401, { error: "You need to sign in or sign up before continuing." });

    await expect(http.get("/guarded")).rejects.toBeDefined();

    expect(handler).toHaveBeenCalledWith("revoked");
    expect(await loadToken()).toBeNull();
  });

  it("says EXPIRED when the token's own exp is in the past", async () => {
    await setToken(bearer(AN_HOUR_AGO));
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    mock.onGet("/guarded").reply(401);

    await expect(http.get("/guarded")).rejects.toBeDefined();

    expect(handler).toHaveBeenCalledWith("expired");
  });

  it("leaves the token alone on a 403 — a different problem with different advice", async () => {
    await setToken("Bearer good");
    mock.onGet("/forbidden").reply(403, { error: "Access denied" });

    await expect(http.get("/forbidden")).rejects.toBeDefined();

    expect(await loadToken()).toBe("Bearer good");
  });
});

describe("telling failures apart", () => {
  // These look identical to a `catch` and they are opposite problems. Karwan
  // shipped "check your connection" on a 401 while the connection was fine.
  it("separates not-signed-in, rate-limited and unreachable", async () => {
    mock.onGet("/a").reply(401);
    mock.onGet("/b").reply(429);
    mock.onGet("/c").networkError();

    const unauthorized = await http.get("/a").catch((e) => e);
    const limited = await http.get("/b").catch((e) => e);
    const offline = await http.get("/c").catch((e) => e);

    expect(isUnauthorized(unauthorized)).toBe(true);
    expect(isRateLimited(unauthorized)).toBe(false);
    expect(isNetworkFailure(unauthorized)).toBe(false);

    // 429 is the one failure where "try again" is the wrong advice — it invites
    // the user to do the thing that keeps the limit closed.
    expect(isRateLimited(limited)).toBe(true);
    expect(isUnauthorized(limited)).toBe(false);

    expect(isNetworkFailure(offline)).toBe(true);
    expect(isUnauthorized(offline)).toBe(false);
  });
});

describe("isNetworkFailure", () => {
  // It used to be `!e.response`, true of ANY thrown object without one —
  // including our own ApiShapeError. Measured on a device: a parse failure made
  // a screen say "Could not reach MultiMagic" while the server had answered
  // that request 200 in 93 ms.
  // Imported at the top, not with a dynamic `await import()` — Jest's CJS
  // runtime cannot do those, and the failure names ES Modules rather than the
  // line that asked for one.
  it("does NOT blame the network for a parse error", () => {
    expect(isNetworkFailure(new ApiShapeError("message.role", null))).toBe(false);
    expect(isNetworkFailure(new Error("anything"))).toBe(false);
  });

  it("still recognises a real transport failure", async () => {
    mock.onGet("/gone").networkError();
    const offline = await http.get("/gone").catch((e) => e);

    expect(isNetworkFailure(offline)).toBe(true);
  });
});

describe("sessionEndReason", () => {
  it("reads exp off the stored Authorization value without verifying it", () => {
    expect(sessionEndReason(bearer(AN_HOUR_AGO))).toBe("expired");
    expect(sessionEndReason(bearer(IN_AN_HOUR))).toBe("revoked");
  });

  // Unreadable is the more careful sentence: "check your devices" costs
  // nothing when wrong; "it just expired" hides a stolen token when wrong.
  it("treats anything it cannot read as revoked", () => {
    expect(sessionEndReason("Bearer not-a-jwt")).toBe("revoked");
    expect(sessionEndReason("Bearer a.!!!.c")).toBe("revoked");
    expect(sessionEndReason("")).toBe("revoked");
  });
});

describe("retryAfterSeconds", () => {
  // Rack::Attack sends both; Rails' own rate_limit on ai#show sends neither.
  it("reads the header first, then the body, then gives up honestly", async () => {
    mock.onGet("/h").reply(429, { error: "too_many_requests", retry_after: 60 }, { "retry-after": "60" });
    mock.onGet("/b").reply(429, { error: "too_many_requests", retry_after: 120 });
    mock.onGet("/n").reply(429);

    expect(retryAfterSeconds(await http.get("/h").catch((e) => e))).toBe(60);
    expect(retryAfterSeconds(await http.get("/b").catch((e) => e))).toBe(120);
    expect(retryAfterSeconds(await http.get("/n").catch((e) => e))).toBeNull();
  });
});

describe("the reachability witness", () => {
  it("reports reached for ANY response, including a 500", async () => {
    const reach = jest.fn();
    setReachabilityHandler(reach);
    mock.onGet("/ok").reply(200, {});
    mock.onGet("/broken").reply(500, {});

    await http.get("/ok");
    await http.get("/broken").catch(() => {});

    expect(reach.mock.calls).toEqual([[true], [true]]);
  });

  it("reports NOT reached only when nothing answered", async () => {
    const reach = jest.fn();
    setReachabilityHandler(reach);
    mock.onGet("/gone").networkError();

    await http.get("/gone").catch(() => {});

    expect(reach).toHaveBeenCalledWith(false);
  });

  // A 10 MB upload timing out on a slow link is not the app being offline.
  it("does not call a timeout offline", async () => {
    const reach = jest.fn();
    setReachabilityHandler(reach);
    mock.onGet("/slow").timeout();

    await http.get("/slow").catch(() => {});

    expect(reach).not.toHaveBeenCalledWith(false);
  });
});

describe("the session email", () => {
  it("round-trips, because the cable looks the user up by it", async () => {
    await setSessionEmail("person@example.com");
    // Drop the in-memory cache: the value must come back from the keystore, the
    // way it does on a cold launch.
    __resetTokenCache();

    expect(await loadSessionEmail()).toBe("person@example.com");
  });
});

// ── `error` AND `errors`: the API speaks both ──────────────────────────────
// Singular for most refusals; plural `full_messages` for validation, which is
// what account deletion answers (`users_controller.rb:116`). Reading only the
// singular made every plural refusal render as the generic fallback.
describe("the server's error sentence", () => {
  const refusal = (data: unknown) => ({ isAxiosError: true, response: { status: 422, data } });

  it("does not read Rails' own error page as a reason", () => {
    // What `PublicExceptions` renders for any exception nothing rescued.
    const page = { isAxiosError: true, response: { status: 500, data: { status: 500, error: "Internal Server Error" } } };
    expect(apiErrorMessage(page)).toBeNull();
  });

  it("reads the singular `error`", () => {
    expect(apiErrorMessage(refusal({ error: "Password is incorrect" }))).toBe("Password is incorrect");
  });

  it("reads the plural `errors` array — the account-deletion shape", () => {
    expect(apiErrorMessage(refusal({ errors: ["Could not delete the account"] }))).toBe(
      "Could not delete the account",
    );
  });

  it("joins several `errors`, one per line", () => {
    expect(apiErrorMessage(refusal({ errors: ["Name is too long", "Email is invalid"] }))).toBe(
      "Name is too long\nEmail is invalid",
    );
  });

  it("reads a field → messages map", () => {
    expect(apiErrorMessage(refusal({ errors: { email: ["has already been taken"] } }))).toBe(
      "has already been taken",
    );
  });

  it("reads JSON:API `{ detail }` objects, the sign-up shape", () => {
    expect(
      apiErrorMessage(refusal({ errors: [{ detail: "has already been taken", source: { pointer: "/data/attributes/email" } }] })),
    ).toBe("has already been taken");
  });

  // multi_magic 30dce44: account deletion answers with BOTH keys.
  it("reads the both-keys shape, keeping every reason", () => {
    expect(apiErrorMessage(refusal({ error: "Password is incorrect", errors: ["Password is incorrect"] }))).toBe(
      "Password is incorrect",
    );
    expect(apiErrorMessage(refusal({ error: "A", errors: ["A", "B"] }))).toBe("A\nB");
  });

  it("says nothing rather than something empty", () => {
    expect(apiErrorMessage(refusal({ errors: [] }))).toBeNull();
    expect(apiErrorMessage(refusal({ error: "" }))).toBeNull();
    expect(apiErrorMessage(refusal("<html>"))).toBeNull();
  });
});
