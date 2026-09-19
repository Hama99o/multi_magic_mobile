/**
 * "HOW TO ANSWER" — standing instructions for one conversation.
 *
 * ── WHICH OF THE TWO THIS IS ──────────────────────────────────────────────
 * **A component test where a flow COULD reach, and both should exist.** e0 owns
 * the flow — `04` and `15` already open this row menu and assert its order, then
 * walk past this entry without touching it — and a flow is the right instrument
 * for "can a person get here from the conversation list". It is the wrong one
 * for the assertion below, which needs a save with an EMPTY field and would
 * otherwise write a real change to his real conversation.
 *
 * ── THE ASSERTION THIS FILE EXISTS FOR ────────────────────────────────────
 * **Clearing is a real instruction.** The component's own comment says it:
 * "Sent even when emptied". Standing instructions are read into every answer in
 * the conversation, so the person who most needs this dialog is the one
 * removing an instruction that is now wrong — and a dialog that quietly treats
 * an empty save as a cancel leaves it in place with the screen saying it is
 * gone. The obvious guard, `if (!text) return`, reads as defensive and is the
 * bug.
 *
 * Its sibling `ScopeDialog` has the same shape of trap (nothing selected means
 * search EVERYWHERE, not search nothing), which is the argument for testing
 * them the same way.
 */
import { render, screen, fireEvent } from "@testing-library/react-native";
import { InstructionsDialog } from "../SessionOptionsDialogs";

const open = (props: Partial<React.ComponentProps<typeof InstructionsDialog>> = {}) =>
  render(
    <InstructionsDialog visible initial="" onCancel={jest.fn()} onSave={jest.fn()} {...props} />,
  );

describe("standing instructions for one conversation", () => {
  it("renders nothing at all when it is not open", () => {
    render(
      <InstructionsDialog visible={false} initial="" onCancel={jest.fn()} onSave={jest.fn()} />,
    );
    expect(screen.queryByTestId("instructions-input")).toBeNull();
  });

  it("opens on what is already set", () => {
    open({ initial: "Answer in French." });
    expect(screen.getByTestId("instructions-input").props.value).toBe("Answer in French.");
  });

  it("SAVES AN EMPTY FIELD — clearing is an instruction, not a cancel", () => {
    // The one that matters. A guard like `if (!text) return` would leave a
    // wrong instruction shaping every answer while the screen said it was gone.
    const onSave = jest.fn();
    open({ initial: "Answer in French.", onSave });

    fireEvent.changeText(screen.getByTestId("instructions-input"), "");
    fireEvent.press(screen.getByTestId("instructions-save"));

    expect(onSave).toHaveBeenCalledWith("");
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("saves what was typed, unchanged", () => {
    const onSave = jest.fn();
    open({ onSave });
    fireEvent.changeText(screen.getByTestId("instructions-input"), "  Answer briefly.  ");
    fireEvent.press(screen.getByTestId("instructions-save"));
    // Not trimmed here: the server owns that, and trimming in two places is how
    // the two disagree about whether a space-only instruction is empty.
    expect(onSave).toHaveBeenCalledWith("  Answer briefly.  ");
  });

  it("counts against the server's own limit", () => {
    // `Ai::Sessions::INSTRUCTIONS_LIMIT`. Shown so the field trims rather than
    // the save failing with a message nobody can act on.
    open({ initial: "abc" });
    expect(screen.getByText("3 / 2000")).toBeTruthy();
    expect(screen.getByTestId("instructions-input").props.maxLength).toBe(2000);
  });

  it("cancels without saving", () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    open({ onSave, onCancel });
    fireEvent.changeText(screen.getByTestId("instructions-input"), "Answer in French.");
    fireEvent.press(screen.getByTestId("instructions-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("forgets an abandoned edit when it is reopened", () => {
    const { rerender } = render(
      <InstructionsDialog visible initial="Answer in French." onCancel={jest.fn()} onSave={jest.fn()} />,
    );
    fireEvent.changeText(screen.getByTestId("instructions-input"), "Something else entirely.");

    rerender(
      <InstructionsDialog visible={false} initial="Answer in French." onCancel={jest.fn()} onSave={jest.fn()} />,
    );
    rerender(
      <InstructionsDialog visible initial="Answer in French." onCancel={jest.fn()} onSave={jest.fn()} />,
    );

    expect(screen.getByTestId("instructions-input").props.value).toBe("Answer in French.");
  });

  it("names the field for a screen reader, since the placeholder disappears", () => {
    open();
    expect(screen.getByTestId("instructions-input")).toHaveAccessibleName("Standing instructions");
  });
});
