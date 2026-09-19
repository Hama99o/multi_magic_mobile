/**
 * The transport, exercised THROUGH its interceptors.
 *
 * axios-mock-adapter rather than `jest.spyOn(http, "get")`: spying replaces the
 * method and the interceptors never run, so a test written that way would pass
 * with the Authorization header and the fingerprint both absent — which are the
 * two things this file exists to get right.
 */
import MockAdapter from "axios-mock-adapter";
import * as SecureStore from "expo-secure-store";
import {
  __resetTokenCache, http, isNetworkFailure, isRateLimited, isUnauthorized,
  loadSessionEmail, loadToken, retryAfterSeconds, sessionEndReason, setReachabilityHandler,
  setSessionEmail, setToken, setUnauthorizedHandler,
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
