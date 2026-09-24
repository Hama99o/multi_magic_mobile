/**
 * THE PROFILE MENU, and mainly: what is NOT in the conversations sheet any more.
 *
 * His words: *"move profile button as where we see photo button — when you
 * click you should be able to see go to profile and logout and lang and theme
 * button should be there; when we click it should show bottom side open dialog
 * to choose lang or theme, so we do not mix it in conversation of session."*
 *
 * The theme, the language, the profile, privacy and sign out all used to live
 * at the bottom of the sheet whose subject is CONVERSATIONS, so changing a
 * language meant opening a list of chats. The assertions that matter are the
 * ones about WHERE each control is, because nothing about how any of them
 * works changed.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

/* eslint-disable import/first */
import { ProfileSheet } from "../ProfileSheet";
import { useAuthStore } from "@/stores/auth.store";

const noop = () => {};

/** The scrim must COVER the screen, not merely exist. Pressing by testID works
 *  on a zero-sized element, which is exactly how a scrim with no size shipped
 *  (`src/theme/fill.ts`), so the geometry is asserted too. */
// `ReactTestInstance.props` is `any` on SDK 54 and typed on SDK 57, where the
// narrower shape below stopped being assignable. Takes the instance itself so
// the helper compiles on both — the sdk-57 worktree is where that surfaced.
function expectCovers(node: { props: Record<string, unknown> }) {
  expect(StyleSheet.flatten(node.props.style as never)).toMatchObject({
    position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
  });
}


beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    user: {
      id: 7,
      email: "qa@example.test",
      firstName: "Qa",
      lastName: "Mobile",
      fullName: "Qa Mobile",
      avatar: null,
    },
    status: "signedIn",
    signedOutReason: null,
  });
});

const open = () =>
  render(<ProfileSheet visible onClose={noop} onSignOut={noop} userId={7} />);

// ── A TAP ON THE CONVERSATION BEHIND THE SHEET CLOSES IT ─────────────────
// Owner, 2026-09-24: tapping outside the Conversations or profile sheet, on
// the conversation still showing behind it, must close it.
describe("outside the sheet", () => {
  it("covers the screen and closes on a tap", () => {
    const onClose = jest.fn();
    render(<ProfileSheet visible onClose={onClose} onSignOut={noop} userId={7} />);
    const scrim = screen.getByTestId("profile-scrim");
    expectCovers(scrim);
    fireEvent.press(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("what is behind the photo", () => {
  it("offers all four things he named, and nothing else has to be hunted for", () => {
    open();
    expect(screen.getByTestId("profile-open-profile")).toBeTruthy();
    expect(screen.getByTestId("profile-open-language")).toBeTruthy();
    expect(screen.getByTestId("profile-open-theme")).toBeTruthy();
    expect(screen.getByTestId("profile-sign-out")).toBeTruthy();
  });

  /**
   * `/account` holds delete-account, which he called important — "without that
   * we will have a problem", and Play requires it. Moving the menu must not be
   * the thing that makes it unreachable.
   */
  it("keeps privacy and account reachable", () => {
    open();
    fireEvent.press(screen.getByTestId("profile-open-account"));
    expect(mockPush).toHaveBeenCalledWith("/account");
  });

  it("says which account this is before offering to sign out of it", () => {
    open();
    expect(screen.getByTestId("profile-identity")).toBeTruthy();
    expect(screen.getByText("qa@example.test")).toBeTruthy();
  });

  it("goes to the profile screen", () => {
    open();
    fireEvent.press(screen.getByTestId("profile-open-profile"));
    expect(mockPush).toHaveBeenCalledWith("/profile");
  });

  it("signs out", () => {
    const onSignOut = jest.fn();
    render(<ProfileSheet visible onClose={noop} onSignOut={onSignOut} userId={7} />);
    fireEvent.press(screen.getByTestId("profile-sign-out"));
    expect(onSignOut).toHaveBeenCalled();
  });

  it("renders nothing at all when it is not open", () => {
    render(<ProfileSheet visible={false} onClose={noop} onSignOut={noop} userId={7} />);
    expect(screen.queryByTestId("profile-sheet")).toBeNull();
  });
});

describe("the choosers are their own pane, not a radio group in a menu", () => {
  it("shows the language choice only after asking for it", () => {
    open();
    expect(screen.queryByTestId("language-row")).toBeNull();

    fireEvent.press(screen.getByTestId("profile-open-language"));
    expect(screen.getByTestId("language-row")).toBeTruthy();
    // And the menu is gone while choosing — one subject at a time is the
    // whole complaint.
    expect(screen.queryByTestId("profile-open-theme")).toBeNull();
  });

  it("shows the theme choice only after asking for it", () => {
    open();
    expect(screen.queryByTestId("theme-row")).toBeNull();

    fireEvent.press(screen.getByTestId("profile-open-theme"));
    expect(screen.getByTestId("theme-row")).toBeTruthy();
  });

  /**
   * A pane that can only be left by dismissing the whole sheet loses the place
   * you came from — the reason there is a back arrow rather than only an ✕.
   */
  it("comes back to the menu", () => {
    open();
    fireEvent.press(screen.getByTestId("profile-open-theme"));
    fireEvent.press(screen.getByTestId("profile-back"));
    expect(screen.getByTestId("profile-open-profile")).toBeTruthy();
  });

  it("does not resume inside a chooser the next time it opens", () => {
    const { rerender } = render(
      <ProfileSheet visible onClose={noop} onSignOut={noop} userId={7} />,
    );
    fireEvent.press(screen.getByTestId("profile-open-language"));
    expect(screen.getByTestId("language-row")).toBeTruthy();

    // Closing resets the pane; reopening must land on the menu.
    fireEvent.press(screen.getByTestId("profile-close"));
    rerender(<ProfileSheet visible onClose={noop} onSignOut={noop} userId={7} />);
    expect(screen.getByTestId("profile-open-profile")).toBeTruthy();
    expect(screen.queryByTestId("language-row")).toBeNull();
  });
});
