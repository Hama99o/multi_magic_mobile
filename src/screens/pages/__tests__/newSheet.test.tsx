/**
 * "+ New" closes BEFORE a picker or a permission prompt opens (QA_DEEP #20):
 * on qa_phone the sheet stayed open behind Android's camera-permission
 * dialog, because the picker was started while the sheet was still sliding
 * away.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";

/* eslint-disable import/first */
import { NewSheet, SHEET_CLOSE_MS } from "../drive/sheets";

it("closes the sheet first, and starts the camera only once it is gone", () => {
  jest.useFakeTimers();
  const onClose = jest.fn();
  const onCamera = jest.fn();
  render(<NewSheet open onClose={onClose} onMedia={() => {}} onFiles={() => {}} onCamera={onCamera} />);
  fireEvent.press(screen.getByTestId("pages-new-camera"));
  expect(onClose).toHaveBeenCalled();
  expect(onCamera).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(SHEET_CLOSE_MS));
  expect(onCamera).toHaveBeenCalled();
  jest.useRealTimers();
});
