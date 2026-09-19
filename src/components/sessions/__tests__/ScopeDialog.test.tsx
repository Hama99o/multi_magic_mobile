/**
 * "SEARCH IN" — the feature no test had ever mounted.
 *
 * `qa/UNWALKED.md` §2. `session-menu-scope`, `scope-*`, `scope-save`,
 * `scope-all` and `scope-cancel` were named by no flow and no test, and nothing
 * rendered `ScopeDialog` at all — the same position `answer-undo` was in, minus
 * the consequence. `qa/FLOW_REGISTER.md` already recorded that `04` and `15` do
 * not cover Search-in; what the backward walk added is that the unit layer did
 * not either, so there was no coverage of any kind.
 *
 * ── THE ASSERTION THIS FILE EXISTS FOR ────────────────────────────────────
 * **Nothing selected means search EVERYWHERE, not search nothing.** That is the
 * one place this screen can be dangerously wrong: an empty array is sent to the
 * server as the scope, and the only thing standing between "all apps" and "no
 * apps" in a person's head is a sentence. The component's own comment calls it
 * "the sentence that stops 'none selected' reading as 'search nothing'", and
 * `docs/TESTING.md` §5 is about assertions whose only source is a comment — so
 * this asserts the behaviour the sentence describes, not the sentence's
 * presence: empty selection renders the ALL copy and saves as `[]`.
 */
import { render, screen, fireEvent } from "@testing-library/react-native";
import { ScopeDialog } from "../SessionOptionsDialogs";

const open = (props: Partial<React.ComponentProps<typeof ScopeDialog>> = {}) =>
  render(
    <ScopeDialog
      visible
      initial={[]}
      onCancel={jest.fn()}
      onSave={jest.fn()}
      {...props}
    />,
  );

describe("choosing what a conversation searches", () => {
  it("renders nothing at all when it is not open", () => {
    render(<ScopeDialog visible={false} initial={[]} onCancel={jest.fn()} onSave={jest.fn()} />);
    expect(screen.queryByTestId("scope-save")).toBeNull();
  });

  it("says nothing-selected means ALL apps, which is the whole risk here", () => {
    open();
    expect(screen.getByText("All apps. Choose some to narrow this chat.")).toBeTruthy();
    // And the escape hatch is absent, because there is nothing to escape from.
    expect(screen.queryByTestId("scope-all")).toBeNull();
  });

  it("counts what is narrowed once something is chosen", () => {
    open();
    fireEvent.press(screen.getByTestId("scope-notes"));
    expect(screen.getByText("Only 1 of 7 apps.")).toBeTruthy();
  });

  it("marks a chosen app checked, so a screen reader hears the state", () => {
    open();
    // One of only two checkbox roles in this app; the tick is a coloured box
    // and nothing else announces it.
    expect(screen.getByTestId("scope-notes").props.accessibilityState.checked).toBe(false);
    fireEvent.press(screen.getByTestId("scope-notes"));
    expect(screen.getByTestId("scope-notes").props.accessibilityState.checked).toBe(true);
  });

  it("toggles back off rather than only on", () => {
    open({ initial: ["notes"] });
    expect(screen.getByTestId("scope-notes").props.accessibilityState.checked).toBe(true);
    fireEvent.press(screen.getByTestId("scope-notes"));
    expect(screen.getByTestId("scope-notes").props.accessibilityState.checked).toBe(false);
  });

  it("saves exactly what is chosen", () => {
    const onSave = jest.fn();
    open({ onSave });
    fireEvent.press(screen.getByTestId("scope-notes"));
    fireEvent.press(screen.getByTestId("scope-calendar"));
    fireEvent.press(screen.getByTestId("scope-save"));
    expect(onSave).toHaveBeenCalledWith(["notes", "calendar"]);
  });

  it("saves an EMPTY list when nothing is chosen — all apps, not no apps", () => {
    const onSave = jest.fn();
    open({ initial: ["notes"], onSave });
    fireEvent.press(screen.getByTestId("scope-all"));
    fireEvent.press(screen.getByTestId("scope-save"));
    expect(onSave).toHaveBeenCalledWith([]);
  });

  it("puts 'search all apps' back to the ALL sentence", () => {
    open({ initial: ["notes", "todos"] });
    expect(screen.getByText("Only 2 of 7 apps.")).toBeTruthy();
    fireEvent.press(screen.getByTestId("scope-all"));
    expect(screen.getByText("All apps. Choose some to narrow this chat.")).toBeTruthy();
  });

  it("cancels without saving", () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    open({ onSave, onCancel });
    fireEvent.press(screen.getByTestId("scope-notes"));
    fireEvent.press(screen.getByTestId("scope-cancel"));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("forgets an abandoned edit when it is reopened", () => {
    // The dialog is kept mounted and toggled by `visible`, so without the
    // effect that resyncs from `initial` a cancelled edit would still be on
    // screen the next time somebody opened it.
    const { rerender } = render(
      <ScopeDialog visible initial={["notes"]} onCancel={jest.fn()} onSave={jest.fn()} />,
    );
    fireEvent.press(screen.getByTestId("scope-todos"));
    expect(screen.getByText("Only 2 of 7 apps.")).toBeTruthy();

    rerender(<ScopeDialog visible={false} initial={["notes"]} onCancel={jest.fn()} onSave={jest.fn()} />);
    rerender(<ScopeDialog visible initial={["notes"]} onCancel={jest.fn()} onSave={jest.fn()} />);

    expect(screen.getByText("Only 1 of 7 apps.")).toBeTruthy();
  });
});
