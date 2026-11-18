/**
 * THE BUTTON UNDER THE KEYBOARD. Device QA 2026-11-18: on AI keys, with the
 * keyboard up, "Vérifier et enregistrer" sat under it — Android scrolls the
 * focused field into view and stops there, so the form's own button, just
 * below, stayed covered, and a tap meant for it landed on the keyboard's
 * suggestion bar. Every scrolling form with a button under its last field had
 * the same shape. With the keyboard up, the screen now scrolls the nearest
 * button below the focused field into view, never pushing the field itself
 * off the top.
 */
import { Keyboard, Platform, Pressable, ScrollView, TextInput, Text } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("@/lib/measure", () => ({ measureIn: jest.fn(), scrollViewTo: jest.fn() }));

/* eslint-disable import/first */
import { measureIn, scrollViewTo } from "@/lib/measure";
import { Screen } from "../ScreenContainer";
import { Button } from "../reusables/button";
import { KeyboardTarget, scrollTargetFor } from "../keyboardTarget";

describe("scrollTargetFor", () => {
  const base = { scrollY: 0, viewport: 500, margin: 16 };

  it("scrolls just enough to show the button", () => {
    expect(scrollTargetFor({ ...base, field: { y: 380, height: 50 }, buttons: [{ y: 480, height: 48 }] })).toBe(44);
  });

  it("does nothing when the button already shows", () => {
    expect(scrollTargetFor({ ...base, field: { y: 100, height: 50 }, buttons: [{ y: 200, height: 48 }] })).toBeNull();
  });

  it("never pushes the field off the top for a button far below", () => {
    expect(scrollTargetFor({ ...base, field: { y: 300, height: 50 }, buttons: [{ y: 1400, height: 48 }] })).toBe(284);
  });

  it("aims at the nearest button BELOW the field, not one above it", () => {
    const buttons = [{ y: 40, height: 48 }, { y: 900, height: 48 }, { y: 560, height: 48 }];
    expect(scrollTargetFor({ ...base, field: { y: 400, height: 50 }, buttons })).toBe(124);
  });

  it("does nothing with no field focused", () => {
    expect(scrollTargetFor({ ...base, field: null, buttons: [{ y: 600, height: 48 }] })).toBeNull();
  });

  // Device 2026-11-18: under edge-to-edge Android did not scroll the focused
  // field itself into view either (field at 977 in a window ending at 885).
  it("brings the field itself into view when no button is below it", () => {
    expect(scrollTargetFor({ ...base, field: { y: 600, height: 50 }, buttons: [{ y: 40, height: 48 }] })).toBe(166);
    expect(scrollTargetFor({ ...base, field: { y: 100, height: 50 }, buttons: [] })).toBeNull();
  });
});

describe("a form on a keyboard-aware screen", () => {
  const original = Platform.OS;
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "android" });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => original });
    jest.restoreAllMocks();
  });

  it("scrolls the form's button into view once the keyboard has lifted the screen", async () => {
    jest.spyOn(Keyboard, "isVisible").mockReturnValue(true);
    const focused = { focused: true };
    jest.spyOn(TextInput.State, "currentlyFocusedInput").mockReturnValue(focused as never);
    // The focused field at 380–430 and the form's button at 480–528, in a 500 dp viewport.
    (measureIn as jest.Mock).mockImplementation(async (node: unknown) =>
      node === focused ? { y: 380, height: 50 } : { y: 480, height: 48 },
    );

    render(
      <Screen scroll avoidKeyboard>
        <TextInput testID="field" />
        <Button testID="save" label="Save" onPress={() => {}} />
        <Text>end</Text>
      </Screen>,
    );
    const scroll = screen.UNSAFE_getByType(ScrollView);

    fireEvent(scroll, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 500 } } });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(scrollViewTo).toHaveBeenCalledWith(expect.anything(), 44);
  });

  // How real screens are built: the screen component renders <Screen> itself,
  // so a hook called in it sits ABOVE Screen's context. On the device the AI
  // keys save never registered for exactly this reason; the wrapper registers
  // from inside.
  it("keeps a hand-built submit in view too, from a screen that renders its own <Screen>", async () => {
    jest.spyOn(Keyboard, "isVisible").mockReturnValue(true);
    const focused = { focused: true };
    jest.spyOn(TextInput.State, "currentlyFocusedInput").mockReturnValue(focused as never);
    (measureIn as jest.Mock).mockImplementation(async (node: unknown) =>
      node === focused ? { y: 380, height: 50 } : { y: 480, height: 48 },
    );
    function FormScreen() {
      return (
        <Screen scroll avoidKeyboard>
          <TextInput testID="field" />
          <KeyboardTarget>
            <Pressable testID="save" onPress={() => {}}>
              <Text>Save</Text>
            </Pressable>
          </KeyboardTarget>
        </Screen>
      );
    }
    render(<FormScreen />);
    fireEvent(screen.UNSAFE_getByType(ScrollView), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 500 } } });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(scrollViewTo).toHaveBeenCalledWith(expect.anything(), 44);
  });

  // Device 2026-11-18, 360 dp: the refusal sentence appeared under the field
  // and pushed the button back under the keyboard. The viewport did not
  // change; the content did.
  it("brings the button back when content above it grows with the keyboard up", async () => {
    jest.spyOn(Keyboard, "isVisible").mockReturnValue(true);
    const focused = { focused: true };
    jest.spyOn(TextInput.State, "currentlyFocusedInput").mockReturnValue(focused as never);
    (measureIn as jest.Mock).mockImplementation(async (node: unknown) =>
      node === focused ? { y: 380, height: 50 } : { y: 480, height: 48 },
    );
    render(
      <Screen scroll avoidKeyboard>
        <TextInput testID="field" />
        <Button testID="save" label="Save" onPress={() => {}} />
      </Screen>,
    );
    const scroll = screen.UNSAFE_getByType(ScrollView);
    fireEvent(scroll, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 500 } } });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    (scrollViewTo as jest.Mock).mockClear();
    // An error line arrives: the button moves down 60.
    (measureIn as jest.Mock).mockImplementation(async (node: unknown) =>
      node === focused ? { y: 380, height: 50 } : { y: 540, height: 48 },
    );
    fireEvent(scroll, "contentSizeChange", 360, 1200);
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(scrollViewTo).toHaveBeenCalledWith(expect.anything(), 104);
  });

  it("leaves the scroll alone while the keyboard is down", async () => {
    jest.spyOn(Keyboard, "isVisible").mockReturnValue(false);
    render(
      <Screen scroll avoidKeyboard>
        <TextInput testID="field" />
        <Button testID="save" label="Save" onPress={() => {}} />
      </Screen>,
    );
    fireEvent(screen.UNSAFE_getByType(ScrollView), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 500 } } });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(scrollViewTo).not.toHaveBeenCalled();
  });
});
