/**
 * The 10,000-character limit (`message.rb:22`): a counter near it, a blocked
 * send over it, and NEVER a cut — decided 2026-09-24.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { LengthCounter, isTooLong } from "../LengthCounter";
import { Composer } from "../Composer";
import { PersonComposer } from "@/screens/people/PersonComposer";

const text = (n: number) => "a".repeat(n);

describe("the counter", () => {
  it("is not there for an ordinary message", () => {
    render(<LengthCounter length={8_999} />);
    expect(screen.queryByTestId("composer-length")).toBeNull();
  });

  it("shows the count near the limit", () => {
    render(<LengthCounter length={9_120} />);
    expect(screen.getByText("9,120 / 10,000")).toBeTruthy();
  });

  it("says how much to remove once over", () => {
    render(<LengthCounter length={10_042} />);
    expect(screen.getByText("Too long to send: remove 42 characters.")).toBeTruthy();
  });

  it("uses the singular for one", () => {
    render(<LengthCounter length={10_001} />);
    expect(screen.getByText("Too long to send: remove 1 character.")).toBeTruthy();
  });

  it("the limit itself is sendable", () => {
    expect(isTooLong(text(10_000))).toBe(false);
    expect(isTooLong(text(10_001))).toBe(true);
  });
});

describe("the composers", () => {
  it("the assistant's blocks send over the limit and cuts nothing", () => {
    const onSend = jest.fn();
    render(<Composer value={text(10_001)} onChange={jest.fn()} onSend={onSend} />);
    fireEvent.press(screen.getByTestId("composer-send"));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByTestId("composer-input").props.maxLength).toBeUndefined();
    expect(screen.getByTestId("composer-input").props.value).toHaveLength(10_001);
  });

  it("the people thread's blocks send over the limit and cuts nothing", () => {
    const onSend = jest.fn();
    render(<PersonComposer value={text(10_001)} onChange={jest.fn()} onSend={onSend} />);
    fireEvent.press(screen.getByTestId("people-composer-send"));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByTestId("people-composer-input").props.maxLength).toBeUndefined();
  });
});
