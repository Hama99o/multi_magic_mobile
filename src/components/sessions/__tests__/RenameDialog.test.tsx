/**
 * The 60-character cap is the server's (`Ai::Sessions::TITLE_LIMIT`), and it
 * is both enforced by the field and SAID beside it — a `maxLength` that stops
 * the typing with no count is a keyboard that seems broken.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { RenameDialog } from "../RenameDialog";
import { LIMITS } from "@/api/ai";

describe("the title cap", () => {
  it("is enforced by the field", () => {
    render(<RenameDialog visible initialTitle="Money" onCancel={jest.fn()} onSave={jest.fn()} />);

    expect(screen.getByTestId("rename-input").props.maxLength).toBe(LIMITS.titleLimit);
    expect(LIMITS.titleLimit).toBe(60);
  });

  it("is said beside the field, and counts as you type", () => {
    render(<RenameDialog visible initialTitle="Money" onCancel={jest.fn()} onSave={jest.fn()} />);
    expect(screen.getByTestId("rename-count")).toHaveTextContent("5 / 60");

    fireEvent.changeText(screen.getByTestId("rename-input"), "Money and the flat renovation");

    expect(screen.getByTestId("rename-count")).toHaveTextContent("29 / 60");
  });

  it("will not save an empty name", () => {
    render(<RenameDialog visible initialTitle="" onCancel={jest.fn()} onSave={jest.fn()} />);

    expect(screen.getByTestId("rename-save").props.accessibilityState.disabled).toBe(true);
  });
});
