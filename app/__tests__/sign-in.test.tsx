/**
 * Sign in, at the level a user meets it.
 *
 * The point of these is the FAILURE COPY. Every one of these errors is a
 * `catch` away from being identical, and telling somebody the wrong thing about
 * why they cannot get in is worse than telling them nothing: a 429 rendered as
 * "wrong password" sends them to reset a password that was always correct.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
// No JSX and no `require` inside this factory: babel-plugin-jest-hoist fails to
// hoist a destructured require and dies with "Property declarations[0] of
// VariableDeclaration expected node to be of a type VariableDeclarator" —
// an error that names neither jest.mock nor this file's real problem.
// `Link asChild` renders its single child, so returning it is faithful.
jest.mock("expo-router", () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a) },
  Link: ({ children }: { children: unknown }) => children,
}));

/* eslint-disable import/first */
import SignIn from "../sign-in";
import { useAuthStore } from "@/stores/auth.store";
import { TwoFactorRequiredError } from "@/api/auth";

function axiosError(status: number) {
  return { response: { status, data: {} }, config: {}, isAxiosError: true };
}

let signIn: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  signIn = jest.fn().mockResolvedValue(undefined);
  useAuthStore.setState({ signIn, user: null, status: "signedOut" });
});

function fill(email = "person@example.com", password = "a-real-password") {
  fireEvent.changeText(screen.getByTestId("sign-in-email"), email);
  fireEvent.changeText(screen.getByTestId("sign-in-password"), password);
}

describe("the form", () => {
  it("offers email, password and the three ways out", () => {
    render(<SignIn />);

    expect(screen.getByTestId("sign-in-email")).toBeTruthy();
    expect(screen.getByTestId("sign-in-password")).toBeTruthy();
    expect(screen.getByTestId("sign-in-submit")).toBeTruthy();
    expect(screen.getByTestId("sign-in-create-account")).toBeTruthy();
    expect(screen.getByTestId("sign-in-forgot")).toBeTruthy();
  });

  // The references disagreed here and the SPEC chose: enabled from the start,
  // validated on press. A disabled button with no explanation is the commonest
  // reason somebody believes a login is broken.
  it("is pressable while empty, and says what is missing", () => {
    render(<SignIn />);

    fireEvent.press(screen.getByTestId("sign-in-submit"));

    expect(screen.getByTestId("sign-in-error")).toHaveTextContent(
      "Enter your email and password.",
    );
    expect(signIn).not.toHaveBeenCalled();
  });

  it("signs in and goes to the conversation", async () => {
    render(<SignIn />);
    fill();

    fireEvent.press(screen.getByTestId("sign-in-submit"));

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({
        email: "person@example.com",
        password: "a-real-password",
      }),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/chat"));
  });

  it("clears the error as soon as the user edits", async () => {
    render(<SignIn />);
    fireEvent.press(screen.getByTestId("sign-in-submit"));
    expect(screen.getByTestId("sign-in-error")).toBeTruthy();

    fireEvent.changeText(screen.getByTestId("sign-in-email"), "p");

    expect(screen.queryByTestId("sign-in-error")).toBeNull();
  });
});

describe("the failure copy", () => {
  it("names a wrong password as a wrong password", async () => {
    signIn.mockRejectedValue(axiosError(401));
    render(<SignIn />);
    fill();

    fireEvent.press(screen.getByTestId("sign-in-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("sign-in-error")).toHaveTextContent(
        "That email and password do not match.",
      ),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // ── THE ONE THAT MATTERS ──────────────────────────────────────────────────
  //
  // `POST /users/login` is rate-limited 10 per 3 minutes. Rendering that as
  // "wrong password" is untrue AND the more alarming of the two: it sends
  // someone to reset a password that was always correct.
  it("says WAIT on a 429, not 'wrong password'", async () => {
    signIn.mockRejectedValue(axiosError(429));
    render(<SignIn />);
    fill();

    fireEvent.press(screen.getByTestId("sign-in-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("sign-in-error")).toHaveTextContent(
        "Too many attempts. Try again in a few minutes.",
      ),
    );
  });

  // Karwan shipped "check your connection" on a 401 while the connection was
  // fine, and people went and restarted their routers. The inverse is just as
  // bad: a credential message for a network failure.
  it("blames the connection only when there is no response", async () => {
    signIn.mockRejectedValue({ config: {}, isAxiosError: true });
    render(<SignIn />);
    fill();

    fireEvent.press(screen.getByTestId("sign-in-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("sign-in-error")).toHaveTextContent(
        "Could not reach MultiMagic. Check your connection.",
      ),
    );
  });

  // 202 is a SUCCESS status. Without the named error the screen would accept
  // the password and do nothing, with no reason for the user to suspect
  // anything went wrong.
  it("says so plainly when the account needs a code this app cannot collect", async () => {
    signIn.mockRejectedValue(new TwoFactorRequiredError("pre-auth"));
    render(<SignIn />);
    fill();

    fireEvent.press(screen.getByTestId("sign-in-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("sign-in-error")).toHaveTextContent(
        "This account needs an emailed code, which this app cannot do yet.",
      ),
    );
  });
});
