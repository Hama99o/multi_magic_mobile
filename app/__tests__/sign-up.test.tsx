/**
 * Create an account, at the level a user meets it — and the point is that
 * EVERY complaint names its field.
 *
 * Two reproductions from the rig, against the real backend: a blank last name
 * travelled to the server and came back as "can't be blank" naming nothing;
 * an existing email came back as "has already been taken" — of what? Devise
 * puts the attribute in `source.pointer` and the bare message in `detail`;
 * the screen used to read only `detail`.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a) },
  Link: ({ children }: { children: unknown }) => children,
}));

const mockSignUp = jest.fn();
jest.mock("@/api/auth", () => ({
  signUp: (...a: unknown[]) => mockSignUp(...a),
}));

/* eslint-disable import/first */
import SignUp, { EMPTY_FORM_SENTENCE, serverErrors } from "../sign-up";
import { useAuthStore } from "@/stores/auth.store";

const USER = { id: 9, email: "new@example.com", firstName: "QA", lastName: "Mobile", fullName: "QA Mobile" };

/** Devise's 400, as registrations_controller.rb builds it. */
function deviseErrors(...items: { attribute: string; detail: string }[]) {
  return {
    isAxiosError: true,
    config: {},
    response: {
      status: 400,
      data: {
        errors: items.map(({ attribute, detail }) => ({
          code: "invalid",
          source: { pointer: `/data/attributes/${attribute}` },
          detail,
        })),
      },
    },
  };
}

function fill(over: Partial<Record<"firstname" | "lastname" | "email" | "password", string>> = {}) {
  const values = {
    firstname: "QA",
    lastname: "Mobile",
    email: "new@example.com",
    password: "a-real-password",
    ...over,
  };
  for (const [field, value] of Object.entries(values)) {
    if (value !== "") fireEvent.changeText(screen.getByTestId(`sign-up-${field}`), value);
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignUp.mockResolvedValue(USER);
  useAuthStore.setState({ user: null, status: "signedOut", signedOutReason: null });
});

describe("before the request", () => {
  // The flow asserts this sentence word for word on an untouched form.
  it("says one sentence for an untouched form", () => {
    render(<SignUp />);

    fireEvent.press(screen.getByTestId("sign-up-submit"));

    expect(screen.getByTestId("sign-up-error")).toHaveTextContent(EMPTY_FORM_SENTENCE);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  // ── THE LAST NAME ────────────────────────────────────────────────────────
  // user.rb:221 requires it. Before this it was the one field the screen did
  // not, so the request went out and came back naming no field.
  it("requires the last name, against the field, without a request", () => {
    render(<SignUp />);
    fill({ lastname: "" });

    fireEvent.press(screen.getByTestId("sign-up-submit"));

    expect(screen.getByTestId("sign-up-error-lastname")).toHaveTextContent("Enter your last name.");
    expect(screen.queryByTestId("sign-up-error")).toBeNull();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("names every blank field, not only the first", () => {
    render(<SignUp />);
    fill({ firstname: "", password: "" });

    fireEvent.press(screen.getByTestId("sign-up-submit"));

    expect(screen.getByTestId("sign-up-error-firstname")).toHaveTextContent("Enter your first name.");
    expect(screen.getByTestId("sign-up-error-password")).toHaveTextContent("Choose a password.");
    expect(screen.queryByTestId("sign-up-error-lastname")).toBeNull();
  });

  it("withdraws a field's complaint as soon as it is edited", () => {
    render(<SignUp />);
    fill({ lastname: "" });
    fireEvent.press(screen.getByTestId("sign-up-submit"));
    expect(screen.getByTestId("sign-up-error-lastname")).toBeTruthy();

    fireEvent.changeText(screen.getByTestId("sign-up-lastname"), "M");

    expect(screen.queryByTestId("sign-up-error-lastname")).toBeNull();
  });
});

describe("what the server says", () => {
  // ── "HAS ALREADY BEEN TAKEN" — OF WHAT? ──────────────────────────────────
  it("puts a taken email under the email field, naming it", async () => {
    mockSignUp.mockRejectedValue(deviseErrors({ attribute: "email", detail: "has already been taken" }));
    render(<SignUp />);
    fill();

    fireEvent.press(screen.getByTestId("sign-up-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("sign-up-error-email")).toHaveTextContent("Email has already been taken"),
    );
    expect(screen.queryByTestId("sign-up-error")).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("puts a password complaint under the password, including the confirmation's", async () => {
    mockSignUp.mockRejectedValue(
      deviseErrors({ attribute: "password_confirmation", detail: "doesn't match Password" }),
    );
    render(<SignUp />);
    fill();

    fireEvent.press(screen.getByTestId("sign-up-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("sign-up-error-password")).toHaveTextContent("Password doesn't match Password"),
    );
  });

  // An attribute this form does not show still gets its name: "Username can't
  // be blank" is a server bug the person can report; "can't be blank" is not.
  it("names an attribute the form has no field for, on the general line", async () => {
    mockSignUp.mockRejectedValue(deviseErrors({ attribute: "username", detail: "can't be blank" }));
    render(<SignUp />);
    fill();

    fireEvent.press(screen.getByTestId("sign-up-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("sign-up-error")).toHaveTextContent("Username can't be blank"),
    );
  });

  it("sorts several complaints onto their own fields at once", () => {
    const parsed = serverErrors(
      deviseErrors(
        { attribute: "email", detail: "has already been taken" },
        { attribute: "lastname", detail: "can't be blank" },
        { attribute: "base", detail: "Something else" },
      ),
    );

    expect(parsed).toEqual({
      fields: { email: "Email has already been taken", lastname: "Last name can't be blank" },
      general: ["Something else"],
    });
  });

  it("blames the connection only when there is no response", async () => {
    mockSignUp.mockRejectedValue({ isAxiosError: true, config: {} });
    render(<SignUp />);
    fill();

    fireEvent.press(screen.getByTestId("sign-up-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("sign-up-error")).toHaveTextContent(
        "Could not reach MultiMagic. Check your connection.",
      ),
    );
  });
});

describe("success", () => {
  it("sends the four fields and lands in the app, signed in", async () => {
    render(<SignUp />);
    fill();

    fireEvent.press(screen.getByTestId("sign-up-submit"));

    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith({
        firstname: "QA",
        lastname: "Mobile",
        email: "new@example.com",
        password: "a-real-password",
      }),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/chat"));
    expect(useAuthStore.getState().status).toBe("signedIn");
    expect(useAuthStore.getState().user).toEqual(USER);
  });
});
