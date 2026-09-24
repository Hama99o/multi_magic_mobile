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
import { act, render, screen } from "@testing-library/react-native";
import { Keyboard, KeyboardAvoidingView, LayoutAnimation, Platform } from "react-native";
import { KeyboardLift, __resetKeyboardLift, anticipateKeyboard } from "../KeyboardLift";
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

describe.each(LIFTS)("$name", ({ name, element }) => {
  it.each(PLATFORMS)("pads for the keyboard on %s", (os) => {
    const platform = jest.replaceProperty(Platform, "OS", os);
    try {
      render(element());

      // A SCREEN on Android lifts with `KeyboardLift` since 2026-09-24: RN's
      // KAV acts on keyboardDidShow, after the keyboard has moved. Its own
      // behaviour is asserted below. The dialogs, and iOS, keep RN's KAV, with
      // "padding" on both platforms for the edge-to-edge reason in the header.
      if (os === "android" && name === "a screen with avoidKeyboard") {
        expect(screen.getByTestId("keyboard-lift")).toBeTruthy();
      } else {
        expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe("padding");
      }
    } finally {
      platform.restore();
    }
  });
});

// ── KeyboardLift: the same overlap arithmetic, started on focus ────────────
describe("KeyboardLift", () => {
  type Handler = (e: unknown) => void;
  let handlers: Record<string, Handler>;
  const padding = () => screen.getByTestId("keyboard-lift-inner").props.style.paddingBottom;

  beforeEach(() => {
    __resetKeyboardLift();
    handlers = {};
    jest.spyOn(Keyboard, "addListener").mockImplementation(((event: string, h: Handler) => {
      handlers[event] = h;
      return { remove: jest.fn() };
    }) as never);
    jest.spyOn(LayoutAnimation, "configureNext").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  /** The box's bottom at y=800 (y 100, height 700); the keyboard top at 500. */
  const show = () =>
    act(() => {
      // The host view's instance (RN's mock native component), which is what
      // the component's ref holds, not the composite wrapper.
      const host = screen.UNSAFE_root.findAll(
        (n: { props: { testID?: string }; instance: unknown }) =>
          n.props.testID === "keyboard-lift" && n.instance != null && "measureInWindow" in (n.instance as object),
      )[0];
      (host.instance as { measureInWindow: unknown }).measureInWindow = (
        cb: (x: number, y: number, w: number, h: number) => void,
      ) => cb(0, 100, 400, 700);
      handlers.keyboardDidShow({ endCoordinates: { screenY: 500, height: 320 } });
    });

  it("pads by the keyboard's OVERLAP, and back to 0 when it hides", () => {
    render(<KeyboardLift><Text>x</Text></KeyboardLift>);
    show();
    expect(padding()).toBe(300);
    act(() => handlers.keyboardDidHide({}));
    expect(padding()).toBe(0);
  });

  it("starts the lift ON FOCUS from the remembered height, before the keyboard reports", () => {
    render(<KeyboardLift><Text>x</Text></KeyboardLift>);
    show();
    act(() => handlers.keyboardDidHide({}));
    act(() => anticipateKeyboard());
    expect(padding()).toBe(300);
  });

  it("does nothing on focus the first time: nothing is remembered yet", () => {
    render(<KeyboardLift><Text>x</Text></KeyboardLift>);
    act(() => anticipateKeyboard());
    expect(padding()).toBe(0);
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
