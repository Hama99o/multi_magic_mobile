/**
 * The serif is the argument (IDENTITY.md §2), so the face it resolves to is
 * asserted — and asserted as the PLATFORM's name, because "serif" on iOS is a
 * warning and San Francisco, not a serif.
 */
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Text } from "../text";
import { FONTS } from "@/theme/fonts";

function familyOf(testID: string): string | undefined {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style).fontFamily;
}

describe("the answer variant", () => {
  it("is set in the platform's own serif, never in a generic name", () => {
    render(<Text variant="answer" testID="answer">You lent Ahmad 500.</Text>);

    expect(familyOf("answer")).toBe(FONTS.serif);
    // Jest runs as iOS (jest-expo's default), so this is the iOS face.
    expect(familyOf("answer")).toBe("Georgia");
  });

  it("is the only variant that names a family — the UI face is the system's", () => {
    render(
      <>
        <Text variant="body" testID="body">b</Text>
        <Text variant="title" testID="title">t</Text>
        <Text variant="label" testID="label">l</Text>
        <Text variant="caption" testID="caption">c</Text>
      </>,
    );

    for (const id of ["body", "title", "label", "caption"]) {
      expect(familyOf(id)).toBeUndefined();
    }
  });
});
