/**
 * The A–Z index maps a touch onto the LETTERS, not onto the whole strip:
 * on a device the strip stretches to the list's height with the letters
 * centred, and a tap on Z jumped to O; before that, with the letters as touch
 * targets, `locationY` was relative to the letter and every tap went to A
 * (2026-11-12, qa_phone3). The touch itself is a device check; these pin the
 * two things that made it wrong.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AzIndex, letterIndexAt } from "../AzIndex";

describe("letterIndexAt", () => {
  // 27 letters in a 405 px block starting 300 px down a 1400 px strip.
  it.each([
    [300, 0],
    [310, 0],
    [700, 26],
    [1390, 26],
    [100, 0],
    [300 + 405 / 2, 13],
  ])("y=%s → letter %s", (y, index) => {
    expect(letterIndexAt(y, 300, 405, 27)).toBe(index);
  });

  it("is NOT the whole strip's proportion (the device bug: Z → O)", () => {
    expect(letterIndexAt(700, 300, 405, 27)).not.toBe(Math.floor((700 / 1400) * 27));
  });
});

describe("AzIndex", () => {
  it("the letters take no touches, so locationY is always the strip's", () => {
    render(<AzIndex letters={["A", "B"]} onJump={jest.fn()} testID="idx" />);
    expect(screen.getByTestId("idx-letters").props.pointerEvents).toBe("none");
  });

  it("a screen reader steps letter by letter", () => {
    const onJump = jest.fn();
    render(<AzIndex letters={["A", "B", "C"]} onJump={onJump} testID="idx" />);
    fireEvent(screen.getByTestId("idx"), "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(onJump).toHaveBeenLastCalledWith("B");
  });
});
