/**
 * The confirm screen, at the level a person meets it — and deliberately
 * WITHOUT mocking `@/api/account`.
 *
 * `docs/design/account/SPEC.md` said out loud that this is the most
 * consequential screen in the app and the least covered: the render table
 * proves its handles exist in both languages, and `18-account-delete` asserts
 * both states of the gate without ever filling the password. Nothing asserted
 * what happens when somebody types one.
 *
 * ── WHY THE MOCK IS AT THE HTTP BOUNDARY ──────────────────────────────────
 * The bug these exist for lived in NEITHER the screen nor the API module. The
 * screen mapped a 401 to "that password is not right", `account.ts` sent the
 * password as the design says it must, and `http.ts`'s interceptor saw a 401
 * on a request carrying a token and ended the session — so the sentence the
 * screen wrote was set on a view being replaced as it set it.
 *
 * Every one of those three was defensible alone. Mocking `deleteAccount` would
 * have left all three in place and passed. So the seam is `MockAdapter` on the
 * shared axios instance: the real screen, the real `account.ts`, the real
 * interceptor, and a fake server.
 *
 * ── NOTHING HERE TOUCHES A REAL ACCOUNT ───────────────────────────────────
 * `qa/RIG_CONTRACT.md`: no test may call account deletion against a real
 * account. `MockAdapter` intercepts inside the process — no request is made,
 * and the only address in this file is invented.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import MockAdapter from "axios-mock-adapter";

const mockReplace = jest.fn();
const mockBack = jest.fn();
// No JSX and no destructured `require` in this factory — see sign-in.test.tsx.
jest.mock("expo-router", () => ({
  router: {
    replace: (...a: unknown[]) => mockReplace(...a),
    back: (...a: unknown[]) => mockBack(...a),
  },
}));

/* eslint-disable import/first */
import DeleteAccount from "../delete-account";
import { http, __resetTokenCache, loadToken, setToken, setUnauthorizedHandler } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

let mock: MockAdapter;
let sessionEnded: jest.Mock;

/** A live token, shaped as devise-jwt hands it back — an hour left on it, so
 *  nothing below can pass by the session having genuinely expired. */
const IN_AN_HOUR = Math.floor(Date.now() / 1000) + 3600;
function bearer(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ jti: "abc", exp })).toString("base64url");
  return `Bearer eyJhbGciOiJIUzI1NiJ9.${payload}.c2ln`;
}

beforeEach(async () => {
  mock = new MockAdapter(http);
  jest.clearAllMocks();
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
  sessionEnded = jest.fn();
  setUnauthorizedHandler(sessionEnded);
  await setToken(bearer(IN_AN_HOUR));
});

afterEach(() => {
  mock.restore();
  setUnauthorizedHandler(null);
});

describe("before anything is typed", () => {
  it("names what goes and what is kept without being asked", () => {
    render(<DeleteAccount />);

    // The disclosure is the point of the screen, not a consequence of
    // intending to delete — it renders whether or not anybody proceeds.
    expect(screen.getByTestId("delete-what-goes")).toBeTruthy();
  });

  it("holds the button until a password is there, and says so to a screen reader", async () => {
    // A reply is armed so that a press which DID get through would show up as
    // both a request and a navigation, rather than as nothing.
    mock.onDelete("/api/v1/users/me").reply(204);
    render(<DeleteAccount />);

    const confirm = screen.getByTestId("delete-account-confirm");
    expect(confirm.props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(confirm);
    // ── THIS LINE IS THE TEST ────────────────────────────────────────────
    // `confirm()` is async, so the request leaves on a microtask. Asserting
    // an empty history straight after the press passes whether or not the
    // press did anything — proven by planting BOTH guards out of the screen
    // and watching this stay green. `docs/TESTING.md` §2 is the same shape.
    await act(async () => {
      await Promise.resolve();
    });

    // Disabled has to MEAN it: a Pressable with `disabled` still carries an
    // onPress, and the handler's own `if (!password) return` is the second
    // belt. Both are allowed to be the one that holds — what is asserted is
    // that no account was deleted by a tap on an empty form.
    expect(mock.history.delete).toHaveLength(0);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("a wrong password", () => {
  // ── THE ONE THIS FILE EXISTS FOR ─────────────────────────────────────────
  //
  // `DELETE /api/v1/users/me` re-sends the password on purpose, so a typo is a
  // 401 on a request that ALSO carried a good token. The interceptor used to
  // read that as a dead session: it cleared the token, sent the person to
  // sign-in, and told them their session had expired. It had not, and they
  // never saw the real reason, because the screen's own sentence was set on a
  // view being replaced as it set it.
  it("stays on the screen, keeps the session, and says what was actually wrong", async () => {
    mock.onDelete("/api/v1/users/me").reply(401, { error: "Password is incorrect" });
    render(<DeleteAccount />);

    fireEvent.changeText(screen.getByTestId("delete-password"), "not-my-password");
    fireEvent.press(screen.getByTestId("delete-account-confirm"));

    await waitFor(() => expect(screen.getByTestId("delete-error")).toBeTruthy());

    expect(sessionEnded).not.toHaveBeenCalled();
    expect(await loadToken()).toBe(bearer(IN_AN_HOUR));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("sends the password rather than relying on the session for it", async () => {
    mock.onDelete("/api/v1/users/me").reply(401);
    render(<DeleteAccount />);

    fireEvent.changeText(screen.getByTestId("delete-password"), "typed-here");
    fireEvent.press(screen.getByTestId("delete-account-confirm"));

    await waitFor(() => expect(mock.history.delete).toHaveLength(1));

    // A valid token is not evidence the OWNER is holding the phone
    // (`src/api/account.ts`). If this ever stops being sent, the screen's
    // whole reason for existing as a screen goes with it.
    expect(JSON.parse(mock.history.delete[0].data as string)).toEqual({ password: "typed-here" });
  });
});

describe("the other ways it can fail", () => {
  it("does not claim the account is gone when nothing answered", async () => {
    mock.onDelete("/api/v1/users/me").networkError();
    render(<DeleteAccount />);

    fireEvent.changeText(screen.getByTestId("delete-password"), "correct-horse");
    fireEvent.press(screen.getByTestId("delete-account-confirm"));

    await waitFor(() => expect(screen.getByTestId("delete-error")).toBeTruthy());

    // Leaving for sign-in after a failed delete reads as "it worked".
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("puts the server's own refusal on screen rather than a generic sentence", async () => {
    mock.onDelete("/api/v1/users/me").reply(422, { error: "Delete your shared keys first." });
    render(<DeleteAccount />);

    fireEvent.changeText(screen.getByTestId("delete-password"), "correct-horse");
    fireEvent.press(screen.getByTestId("delete-account-confirm"));

    await waitFor(() =>
      expect(screen.getByTestId("delete-error")).toHaveTextContent("Delete your shared keys first."),
    );
  });
});

describe("when it works", () => {
  it("leaves for sign-in and shows no success screen", async () => {
    mock.onDelete("/api/v1/users/me").reply(204);
    render(<DeleteAccount />);

    fireEvent.changeText(screen.getByTestId("delete-password"), "correct-horse");
    fireEvent.press(screen.getByTestId("delete-account-confirm"));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/sign-in"));

    // The session is gone, so there is nothing left to show a confirmation on
    // — the screen says so in its own comment, and this is the assertion.
    expect(screen.queryByTestId("delete-error")).toBeNull();
  });
});
