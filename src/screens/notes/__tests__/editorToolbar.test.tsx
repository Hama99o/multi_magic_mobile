/**
 * The toolbar component draws the keys toolbarModel decides, with a 48 dp hit
 * area, a translated accessibility label, `selected` when active, and the
 * web's colour on each swatch (SPEC §C3). Props only.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { TOKENS } from "@/theme/tokens";
import { EditorToolbar, type ToolbarLabels } from "../editor/EditorToolbar";
import { buildToolbar, type ToolbarInput } from "../editor/toolbarModel";

const base: ToolbarInput = { marks: {}, nodes: { paragraph: true }, canUndo: true, canRedo: false, hasSelection: false, panel: null, focused: true };
const labels: ToolbarLabels = new Proxy({} as ToolbarLabels, { get: (_t, id) => `L:${String(id)}` });

const draw = (input: Partial<ToolbarInput>, onCommand = jest.fn()) => {
  render(<EditorToolbar keys={buildToolbar({ ...base, ...input }).keys} labels={labels} colors={TOKENS.dark} onCommand={onCommand} />);
  return onCommand;
};

it("draws every key with its translated label", () => {
  draw({});
  for (const k of buildToolbar(base).keys.filter((k) => k.id !== "spacer")) expect(screen.getByTestId(`tb-${k.id}`)).toBeTruthy();
  expect(screen.getByLabelText("L:undo")).toBeTruthy();
});

it("pressing a key hands its command to the screen", () => {
  const onCommand = draw({});
  fireEvent.press(screen.getByTestId("tb-noteColor"));
  expect(onCommand).toHaveBeenCalledWith({ kind: "sheet", sheet: "noteColor" });
});

it("a disabled key does nothing and says so", () => {
  const onCommand = draw({});
  const redo = screen.getByTestId("tb-redo");
  expect(redo.props.accessibilityState).toMatchObject({ disabled: true });
  fireEvent.press(redo);
  expect(onCommand).not.toHaveBeenCalled();
});

it("an active mark is announced as selected", () => {
  draw({ hasSelection: true, marks: { bold: true } });
  expect(screen.getByTestId("tb-bold").props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByTestId("tb-italic").props.accessibilityState).toMatchObject({ selected: false });
});

it("spacers are not keys: nothing to press, nothing announced", () => {
  draw({});
  expect(screen.getAllByTestId("tb-spacer", { includeHiddenElements: true })).toHaveLength(2);
  expect(screen.getAllByTestId("tb-spacer", { includeHiddenElements: true })[0].props.accessibilityElementsHidden).toBe(true);
});

it("colour swatches show the web's colour, and default shows none", () => {
  draw({ panel: "textColor" });
  const blue = screen.getByTestId("tb-textColor:blue-swatch");
  expect(blue).toHaveStyle({ backgroundColor: "hsl(202, 64%, 52%)" });
  expect(screen.getByTestId("tb-textColor:default-swatch")).toHaveStyle({ backgroundColor: "transparent" });
});

it("every key is at least 48 dp to touch", () => {
  draw({});
  expect(screen.getByTestId("tb-undo")).toHaveStyle({ minWidth: 48, minHeight: 48 });
});
