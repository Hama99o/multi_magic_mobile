/**
 * EVERY SCREEN A PERSON TYPES ON LIFTS ITSELF ABOVE THE KEYBOARD — on both
 * platforms, which is the whole finding.
 *
 * The rule used to be `Platform.OS === "ios" ? "padding" : undefined`, on the
 * belief that Android's window resize made padding redundant and harmful.
 * Both halves were wrong: `KeyboardAvoidingView` MEASURES rather than
 * assumes, so padding is 0 when the window did resize; and this app ships
 * `edgeToEdgeEnabled`, where the window is NOT resized for the IME at all.
 *
 * The cost was measured on a device: on a people thread with the keyboard up,
 * the composer was off-screen and `people-composer-send` was absent from the
 * hierarchy. `09-keyboard` had been passing on the assistant's screen the
 * whole time — on an AVD whose Gboard is in floating mode, which its own
 * header calls "the easy case, not the hard one".
 *
 * So this asserts the platform-independent rule, in a table, for every screen
 * that has a field. A screen added to the app with a text input and no
 * `avoidKeyboard` is the failure this cannot see; the row is the reminder.
 */
import { render, screen } from "@testing-library/react-native";
import { KeyboardAvoidingView, Platform } from "react-native";
import { Screen } from "../ScreenContainer";
import { Text } from "../reusables/text";
import { RenameDialog } from "../sessions/RenameDialog";
import { InstructionsDialog } from "../sessions/SessionOptionsDialogs";

const PLATFORMS = ["ios", "android"] as const;

/** Everything that puts a keyboard over its own content. */
const LIFTS = [
  {
    name: "a screen with avoidKeyboard",
    element: () => (
      <Screen avoidKeyboard>
        <Text>anything</Text>
      </Screen>
    ),
  },
  {
    name: "the rename dialog",
    element: () => <RenameDialog visible initialTitle="Money" onCancel={jest.fn()} onSave={jest.fn()} />,
  },
  {
    name: "the instructions dialog",
    element: () => <InstructionsDialog visible initial="" onCancel={jest.fn()} onSave={jest.fn()} />,
  },
];

describe.each(LIFTS)("$name", ({ element }) => {
  it.each(PLATFORMS)("pads for the keyboard on %s", (os) => {
    const platform = jest.replaceProperty(Platform, "OS", os);
    try {
      render(element());

      // "padding" on BOTH. On Android it is 0 wherever the window resizes and
      // the real height wherever it does not — which is the edge-to-edge case
      // this app actually ships.
      expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe("padding");
    } finally {
      platform.restore();
    }
  });
});

describe("a screen without a field", () => {
  it("does not wrap itself in one — the lift is opt-in", () => {
    render(
      <Screen>
        <Text>a list</Text>
      </Screen>,
    );

    expect(screen.UNSAFE_queryByType(KeyboardAvoidingView)).toBeNull();
  });
});
