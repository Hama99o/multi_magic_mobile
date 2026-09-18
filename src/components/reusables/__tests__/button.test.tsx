/**
 * A guard for a bug that shipped and that no other test could see.
 *
 * The first version of `Button` passed `style={({ pressed }) => ({ ... })}`.
 * With `jsxImportSource: "nativewind"` the interop wrapper DROPS a function
 * style on Pressable — not just the pressed state, the whole object. The button
 * lost its background, height, padding and centring and rendered as bare
 * `onAccent` white text, which on the light ground is invisible.
 *
 * Every unit test passed. `tsc` passed. It bundled. The only thing that caught
 * it was a screenshot. So this asserts the one property that would have.
 */
import { render, screen } from "@testing-library/react-native";
import { Button } from "../button";

describe("Button", () => {
  it("passes an OBJECT style, never a function", () => {
    render(<Button label="Sign in with email" testID="b" />);

    const style = screen.getByTestId("b").props.style;

    // The assertion that matters: a function here renders an invisible button.
    expect(typeof style).not.toBe("function");
    expect(style).toBeTruthy();
  });

  it("keeps a filled background and the 48dp touch floor", () => {
    render(<Button label="Sign in with email" testID="b" />);

    const style = screen.getByTestId("b").props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;

    expect(flat.backgroundColor).toBeTruthy();
    expect(flat.minHeight).toBeGreaterThanOrEqual(48);
    expect(flat.alignItems).toBe("center");
  });

  it("dims and blocks presses while busy", () => {
    render(<Button label="Sign in" busy testID="b" />);

    const node = screen.getByTestId("b");
    const style = node.props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;

    expect(flat.opacity).toBeLessThan(1);
    expect(node.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });
});
