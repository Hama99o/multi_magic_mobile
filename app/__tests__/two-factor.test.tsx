/**
 * THE EMAILED CODE, at the level a user meets it.
 *
 * His report: *"it should work on mobile also — it sends code but there it did
 * not have option in mobile."* With 2FA on his account the server mails a
 * code, revokes the previous JWT and answers 202; this app had no screen to
 * spend it on, so his own account was unreachable from this phone. That is the
 * failure these pin, and the two that matter most are the ones with no visible
 * symptom: arriving with nothing pending, and a verify that returns a user but
 * no token.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
// No JSX and no `require` in this factory — see `sign-in.test.tsx` for the
// hoisting error that produces if you try.
jest.mock("expo-router", () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a) },
}));

const mockTrust = jest.fn().mockResolvedValue(true);
jest.mock("@/api/auth", () => ({ trustThisDevice: (...a: unknown[]) => mockTrust(...a) }));

/* eslint-disable import/first */
import TwoFactor from "../two-factor";
import { useAuthStore } from "@/stores/auth.store";

function axiosError(status: number, data: Record<string, unknown> = {}) {
  return { response: { status, data }, config: {}, isAxiosError: true };
}

let verifyTwoFactor: jest.Mock;
let clearTwoFactor: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  verifyTwoFactor = jest.fn().mockResolvedValue(undefined);
  clearTwoFactor = jest.fn();
  useAuthStore.setState({
    verifyTwoFactor,
    clearTwoFactor,
    pendingTwoFactor: "pre-auth-token",
    user: null,
    status: "signedOut",
  });
});

const enter = (code: string) => fireEvent.changeText(screen.getByTestId("two-factor-code"), code);

describe("spending the code", () => {
  it("verifies, then asks whether to remember this phone", async () => {
    render(<TwoFactor />);
    enter("513674");
    fireEvent.press(screen.getByTestId("two-factor-submit"));

    await waitFor(() => expect(verifyTwoFactor).toHaveBeenCalledWith("513674"));
    // NOT straight to the assistant: the offer to trust belongs to somebody
    // who has just proved they hold the account, which is why it is here and
    // not a checkbox beside the code field.
    await waitFor(() => expect(screen.getByTestId("two-factor-verified")).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  /**
   * A pasted "Your code is 513674" must leave the six digits that matter, and
   * a seventh keystroke must not silently make the code wrong. Both are the
   * kind of thing that reads to the user as "the server rejected my code".
   */
  it("keeps only digits, and only six of them", () => {
    render(<TwoFactor />);
    enter("Your code is 5136740000");
    expect(screen.getByTestId("two-factor-code").props.value).toBe("513674");
  });

  it("refuses a short code without spending a round trip", async () => {
    render(<TwoFactor />);
    enter("5136");
    fireEvent.press(screen.getByTestId("two-factor-submit"));

    await waitFor(() => expect(screen.getByTestId("two-factor-error")).toBeTruthy());
    expect(verifyTwoFactor).not.toHaveBeenCalled();
  });
});

describe("when the code does not work", () => {
  /**
   * The server is the only party that knows whether the code was wrong,
   * expired, or the last attempt before lockout — and it sends `attempts_left`
   * with the sentence. Replacing its wording with ours throws that away.
   */
  it("renders the server's own sentence rather than a generic one", async () => {
    verifyTwoFactor.mockRejectedValue(
      axiosError(422, { message: "Invalid or expired code. 2 attempts left." }),
    );
    render(<TwoFactor />);
    enter("000000");
    fireEvent.press(screen.getByTestId("two-factor-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("two-factor-error")).toHaveTextContent(
        "Invalid or expired code. 2 attempts left.",
      ),
    );
  });

  // A 429 read as "wrong code" sends somebody to request another email, which
  // is the one thing that cannot help — the same rule as the sign-in screen.
  it("does not call a rate limit a bad code", async () => {
    verifyTwoFactor.mockRejectedValue(axiosError(429));
    render(<TwoFactor />);
    enter("513674");
    fireEvent.press(screen.getByTestId("two-factor-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("two-factor-error")).toHaveTextContent(
        "Too many attempts. Try again in a few minutes.",
      ),
    );
  });

  it("does not call a dead connection a bad code either", async () => {
    verifyTwoFactor.mockRejectedValue({ isAxiosError: true, request: {}, config: {} });
    render(<TwoFactor />);
    enter("513674");
    fireEvent.press(screen.getByTestId("two-factor-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("two-factor-error")).toHaveTextContent(
        "Could not reach MultiMagic. Check your connection.",
      ),
    );
  });

  it("stays on the screen so the next attempt does not start from the password", async () => {
    verifyTwoFactor.mockRejectedValue(axiosError(422, { message: "Invalid or expired code." }));
    render(<TwoFactor />);
    enter("000000");
    fireEvent.press(screen.getByTestId("two-factor-submit"));

    await waitFor(() => expect(screen.getByTestId("two-factor-error")).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByTestId("two-factor-code")).toBeTruthy();
  });
});

describe("arriving with nothing to spend", () => {
  /**
   * The web screen opens with this guard and it is not decoration: a deep
   * link, a reload, or a code already used leaves no pre-auth token, and
   * asking for six digits that cannot be verified is a screen that can only
   * fail. The server has already revoked the previous JWT, so the only honest
   * destination is sign-in.
   */
  it("sends you back to sign in", () => {
    useAuthStore.setState({ pendingTwoFactor: null });
    render(<TwoFactor />);
    expect(mockReplace).toHaveBeenCalledWith("/sign-in");
  });

  it("does not do that while a code IS pending", () => {
    render(<TwoFactor />);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("the way out", () => {
  it("abandons the pending code, so sign-in does not bounce straight back", () => {
    render(<TwoFactor />);
    fireEvent.press(screen.getByTestId("two-factor-back"));

    expect(clearTwoFactor).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/sign-in");
  });
});

/**
 * TRUSTING THE PHONE — the half that used to be impossible.
 *
 * `trusted_devices#create` answered with a `Set-Cookie` and this client keeps
 * no cookie jar, so the button would have posted, reported success, and
 * changed nothing: a code again on the very next sign-in, with no explanation.
 * The server now returns the token in the body and `X-Trusted-Device` carries
 * it back.
 */
describe("after the code is accepted", () => {
  const verify = async () => {
    render(<TwoFactor />);
    enter("513674");
    fireEvent.press(screen.getByTestId("two-factor-submit"));
    await waitFor(() => expect(screen.getByTestId("two-factor-verified")).toBeTruthy());
  };

  it("trusts the phone and goes on", async () => {
    await verify();
    fireEvent.press(screen.getByTestId("two-factor-trust"));

    await waitFor(() => expect(mockTrust).toHaveBeenCalled());
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/chat"));
  });

  it("takes no for an answer without asking the server anything", async () => {
    await verify();
    fireEvent.press(screen.getByTestId("two-factor-not-now"));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/chat"));
    expect(mockTrust).not.toHaveBeenCalled();
  });

  /**
   * The session is already established by the time this is offered, so a
   * failed trust costs one emailed code next time and nothing else. Holding
   * somebody on this screen over it would turn a convenience into a blocker.
   */
  it("goes on anyway when trusting fails", async () => {
    mockTrust.mockResolvedValueOnce(false);
    await verify();
    fireEvent.press(screen.getByTestId("two-factor-trust"));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/chat"));
  });

  /**
   * The pre-auth token is spent by now, so the "nothing pending" guard would
   * fire and bounce somebody off the screen that is about to offer them a
   * choice — a guard introducing the bug it exists to prevent.
   */
  it("does not bounce back to sign-in once the token is spent", async () => {
    await verify();
    act(() => useAuthStore.setState({ pendingTwoFactor: null }));

    expect(screen.getByTestId("two-factor-verified")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
