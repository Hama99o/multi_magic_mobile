/**
 * The reason a session ended travels from the interceptor to the sign-in
 * screen, and is cleared by the two things that make it stale: a deliberate
 * sign-out and the next successful sign-in.
 */
import MockAdapter from "axios-mock-adapter";

jest.mock("@/lib/cable", () => ({ resetCable: jest.fn() }));
jest.mock("@/api/auth", () => ({
  signIn: jest.fn(async () => ({ id: 1, email: "person@example.com", firstName: "A", lastName: "B", fullName: "A B" })),
  signOut: jest.fn(async () => {}),
}));

/* eslint-disable import/first */
import { sessionEndSentence, useAuthStore, wireAuthStore } from "../auth.store";
import { __resetTokenCache, http, setToken, setUnauthorizedHandler } from "@/api/http";
import { resetCable } from "@/lib/cable";

let mock: MockAdapter;

beforeEach(() => {
  jest.clearAllMocks();
  mock = new MockAdapter(http);
  __resetTokenCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
  setUnauthorizedHandler(null);
  useAuthStore.setState({ user: null, status: "unknown", signedOutReason: null });
});

afterEach(() => mock.restore());

function bearer(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `Bearer h.${payload}.s`;
}

describe("forceSignOut", () => {
  it("records the reason, drops the socket and signs out", () => {
    useAuthStore.setState({ status: "signedIn" });

    useAuthStore.getState().forceSignOut("revoked");

    const state = useAuthStore.getState();
    expect(state.status).toBe("signedOut");
    expect(state.signedOutReason).toBe("revoked");
    expect(state.user).toBeNull();
    expect(resetCable).toHaveBeenCalled();
  });
});

describe("the reason goes stale", () => {
  it("is cleared by a successful sign-in", async () => {
    useAuthStore.setState({ status: "signedOut", signedOutReason: "expired" });

    await useAuthStore.getState().signIn({ email: "person@example.com", password: "pw" });

    expect(useAuthStore.getState().signedOutReason).toBeNull();
    expect(useAuthStore.getState().status).toBe("signedIn");
  });

  it("is cleared by a deliberate sign-out", async () => {
    useAuthStore.setState({ status: "signedIn", signedOutReason: "revoked" });

    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState().signedOutReason).toBeNull();
  });
});

describe("wired to the transport", () => {
  // End to end: a live token refused by the server ends the session with
  // "revoked", through the interceptor, into the store, with no screen involved.
  it("turns a 401 on a live token into a REVOKED sign-out", async () => {
    wireAuthStore();
    await setToken(bearer(Math.floor(Date.now() / 1000) + 3600));
    useAuthStore.setState({ status: "signedIn" });
    mock.onGet("/guarded").reply(401);

    await http.get("/guarded").catch(() => {});

    expect(useAuthStore.getState().status).toBe("signedOut");
    expect(useAuthStore.getState().signedOutReason).toBe("revoked");
  });

  it("does not sign out on the login's own 401", async () => {
    wireAuthStore();
    useAuthStore.setState({ status: "signedOut", signedOutReason: null });
    mock.onPost("/users/login").reply(401, { error: "Invalid Email or password." });

    await http.post("/users/login", {}).catch(() => {});

    expect(useAuthStore.getState().signedOutReason).toBeNull();
  });
});

describe("the sentences", () => {
  it("exist for both reasons and differ in what they ask", () => {
    expect(sessionEndSentence("expired")).toMatch(/expired/i);
    expect(sessionEndSentence("revoked")).toMatch(/device/i);
    expect(sessionEndSentence("revoked")).not.toBe(sessionEndSentence("expired"));
  });
});
