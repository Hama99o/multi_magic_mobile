/**
 * Flow's sheets take the app's one sheet shape (docs/design/app-shell/SHEETS.md
 * row 2): a centred 560 dp card on a tablet, a bottom sheet on a phone.
 */
import { render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { BottomSheet } from "../BottomSheet";

const RN = require("react-native");
afterEach(() => jest.restoreAllMocks());

it.each([
  [800, 560],
  [411, "100%"],
] as const)("at %s dp the sheet is %s wide", (w, expected) => {
  jest.spyOn(RN, "useWindowDimensions").mockReturnValue({ width: w, height: 1200, scale: 2, fontScale: 1 });
  render(
    <BottomSheet open title="Move" onClose={jest.fn()} testID="flow-sheet">
      <Text>inside</Text>
    </BottomSheet>,
  );
  expect(StyleSheet.flatten(screen.getByTestId("flow-sheet").props.style).width).toBe(expected);
  expect(screen.getByTestId("flow-sheet-close")).toBeTruthy();
});
