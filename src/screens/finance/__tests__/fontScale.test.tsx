/**
 * Finance at 200 % font (Hello's sweep, 2026-11-21): the amount keypad's keys are a fixed 56 dp,
 * so their digits must fit at the largest Android setting.
 */
import { render } from "@testing-library/react-native";
import { clipped, type Host } from "@/__tests__/fontClip";
import { AmountPad } from "../parts";

it("the amount keypad at 200 %: no digit is clipped by its 56 dp key", () => {
  jest.spyOn(require("react-native"), "useWindowDimensions").mockReturnValue({ width: 411, height: 900, scale: 2, fontScale: 2 });
  const root = render(<AmountPad value="12" onChange={() => undefined} />).UNSAFE_root as unknown as Host;
  expect(clipped(root, 2)).toEqual([]);
});
