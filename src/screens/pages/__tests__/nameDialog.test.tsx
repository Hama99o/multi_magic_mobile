/**
 * THE NAME DIALOG (New folder, Rename), two audit P2 items (2026-11-16):
 * - New folder kept the text typed the last time it was opened;
 * - Rename selected the whole name, so typing replaced the extension too
 *   ("clip.mp4" became "beach"). Drive selects the name without it.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { NameDialog } from "../ItemSheet";

const props = { title: "Folder", confirm: "Create", onCancel: () => {}, onSubmit: () => {}, busy: false, error: null };

it("opens empty each time, not with the text typed last time", () => {
  const view = render(<NameDialog {...props} open />);
  fireEvent.changeText(screen.getByTestId("pages-name-input"), "Holiday");
  view.rerender(<NameDialog {...props} open={false} />);
  view.rerender(<NameDialog {...props} open />);
  expect(screen.getByTestId("pages-name-input").props.value).toBe("");
});

it("rename of a file selects the name without its extension", () => {
  render(<NameDialog {...props} open initial="vlog-a.mp4" keepExtension />);
  const input = screen.getByTestId("pages-name-input");
  expect(input.props.value).toBe("vlog-a.mp4");
  expect(input.props.selection).toEqual({ start: 0, end: 6 });
  expect(input.props.selectTextOnFocus).toBeFalsy();
});

it("once the person moves the cursor, the dialog lets it be", () => {
  render(<NameDialog {...props} open initial="vlog-a.mp4" keepExtension />);
  fireEvent(screen.getByTestId("pages-name-input"), "selectionChange", { nativeEvent: { selection: { start: 2, end: 2 } } });
  expect(screen.getByTestId("pages-name-input").props.selection).toBeUndefined();
});

it("a folder, or a name with no extension, is selected whole", () => {
  const view = render(<NameDialog {...props} open initial="Vlogs v1.2" />);
  expect(screen.getByTestId("pages-name-input").props.selection).toEqual({ start: 0, end: 10 });
  view.rerender(<NameDialog {...props} open={false} />);
  view.rerender(<NameDialog {...props} open initial="README" keepExtension />);
  expect(screen.getByTestId("pages-name-input").props.selection).toEqual({ start: 0, end: 6 });
});
