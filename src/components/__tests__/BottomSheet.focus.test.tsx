/**
 * A sheet with a field opens the keyboard (`BottomSheet.tsx` `focusRef`).
 *
 * Measured on qa_phone3, 2026-11-20: `autoFocus` inside the sheet's Modal put
 * the cursor in the field and opened no keyboard, on every sheet with a field.
 * Focusing once the Modal reports itself shown did open it. What this proves:
 * the sheet asks for focus after `onShow`, not before. What it cannot: that
 * Android then raises the keyboard. That is the device, and was seen there.
 */
import { act, render, screen } from "@testing-library/react-native";
import { Modal, Text, type TextInput } from "react-native";
import { BottomSheet } from "../BottomSheet";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

afterEach(() => jest.useRealTimers());

it("focuses the given input once the modal is shown, and not before", () => {
  jest.useFakeTimers();
  const focus = jest.fn();
  const ref = { current: { focus, isFocused: () => false } as unknown as TextInput };
  render(
    <BottomSheet open title="Story Points" onClose={() => {}} focusRef={ref} testID="sheet">
      <Text>body</Text>
    </BottomSheet>,
  );
  act(() => jest.runAllTimers());
  expect(focus).not.toHaveBeenCalled();

  act(() => {
    screen.UNSAFE_getByType(Modal).props.onShow();
    jest.runAllTimers();
  });
  expect(focus).toHaveBeenCalled();
});

it("tries again after the slide-in when the first focus was taken away, and not when it held", () => {
  jest.useFakeTimers();
  const focus = jest.fn();
  let focused = false;
  const ref = { current: { focus, isFocused: () => focused } as unknown as TextInput };
  render(
    <BottomSheet open title="New sprint" onClose={() => {}} focusRef={ref} testID="sheet">
      <Text>body</Text>
    </BottomSheet>,
  );
  act(() => {
    screen.UNSAFE_getByType(Modal).props.onShow();
    jest.advanceTimersByTime(100);
  });
  expect(focus).toHaveBeenCalledTimes(1);
  // Taken away by the closing sheet: the second attempt focuses again.
  act(() => jest.advanceTimersByTime(400));
  expect(focus).toHaveBeenCalledTimes(2);

  focus.mockClear();
  act(() => {
    screen.UNSAFE_getByType(Modal).props.onShow();
    jest.advanceTimersByTime(100);
    focused = true;
    jest.advanceTimersByTime(400);
  });
  expect(focus).toHaveBeenCalledTimes(1);
});

it("does nothing on show when there is no field to focus", () => {
  render(
    <BottomSheet open title="Move" onClose={() => {}} testID="sheet">
      <Text>body</Text>
    </BottomSheet>,
  );
  expect(() => act(() => screen.UNSAFE_getByType(Modal).props.onShow())).not.toThrow();
});
