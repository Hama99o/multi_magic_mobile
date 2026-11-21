/**
 * The shared sheet frame (Hello for the owner, 2026-11-21: "Notes bottom
 * sheets span the full width at 800 dp"). A phone gets a bottom sheet the
 * width of the screen; a tablet a centred 560 dp card, as the Apps sheet
 * already does (src/components/shell/AppSwitcher.tsx).
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { SheetFrame, SHEET_CARD_WIDTH } from "../SheetFrame";

// The module object the component reads at call time (a `* as` copy would not reach it).
const RN = require("react-native");

const widthOf = (w: number) => jest.spyOn(RN, "useWindowDimensions").mockReturnValue({ width: w, height: 900, scale: 2, fontScale: 1 });
afterEach(() => jest.restoreAllMocks());

const open = (onClose = jest.fn(), keyboard = false) =>
  render(
    <SheetFrame visible onClose={onClose} closeLabel="Close" testID="the-sheet" keyboard={keyboard}>
      <Text>inside</Text>
    </SheetFrame>,
  );
const style = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);

it("on a phone: a bottom sheet the width of the screen, sliding up", () => {
  widthOf(360);
  open();
  expect(style("the-sheet")).toMatchObject({ width: "100%", borderBottomLeftRadius: 0 });
  expect(style("the-sheet-frame")).toMatchObject({ justifyContent: "flex-end" });
  expect(screen.UNSAFE_getByType(RN.Modal).props.animationType).toBe("slide");
});

it("on a tablet: a centred card of 560 dp, fading in (the Apps sheet's shape)", () => {
  widthOf(800);
  open();
  expect(SHEET_CARD_WIDTH).toBe(560);
  expect(style("the-sheet")).toMatchObject({ width: 560 });
  expect(style("the-sheet")).not.toMatchObject({ borderBottomLeftRadius: 0 });
  expect(style("the-sheet-frame")).toMatchObject({ justifyContent: "center", alignItems: "center" });
  expect(screen.UNSAFE_getByType(RN.Modal).props.animationType).toBe("fade");
});

it("a tap outside closes it, and the scrim has a name", () => {
  widthOf(360);
  const onClose = jest.fn();
  open(onClose);
  // The card is accessibilityViewIsModal, so a screen reader stays in it and
  // the scrim is hidden from it (as in the Apps sheet); a finger still taps it.
  const scrim = screen.getByTestId("the-sheet-scrim", { includeHiddenElements: true });
  fireEvent.press(scrim);
  expect(onClose).toHaveBeenCalled();
  expect(scrim.props.accessibilityLabel).toBe("Close");
});

it("a sheet with a field sits above the keyboard", () => {
  widthOf(360);
  open(jest.fn(), true);
  expect(screen.getByTestId("keyboard-padding")).toBeTruthy();
});
