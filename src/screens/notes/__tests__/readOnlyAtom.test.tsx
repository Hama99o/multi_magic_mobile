/**
 * Inside the editor, a block the phone may not edit (table, code, sub/sup,
 * comment, legacy markup, image) is drawn by our own read view from the exact
 * node the atom carries. It never turns into nothing.
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";

import { TOKENS } from "@/theme/tokens";
import { ReadOnlyAtom, ReadOnlyAtomProvider } from "../editor/ReadOnlyAtom";
import type { DocNode, EditorLabels } from "../editor/types";

jest.mock("expo-image", () => {
  const { View } = jest.requireActual("react-native");
  const ReactActual = jest.requireActual("react");
  return { Image: (props: Record<string, unknown>) => ReactActual.createElement(View, props) };
});

const labels: EditorLabels = {
  table: (r, c) => `Table · ${r} × ${c}`,
  code: (l) => (l ? `Code · ${l}` : "Code"),
  legacyImage: "Old image",
  embed: "Video",
  unknown: (t) => `Unknown ${t}`,
  imageUnavailable: "No image",
  checked: "Done",
  unchecked: "Not done",
};

const props = (node: unknown, kind = "codeBlock") => ({
  attrs: { kind, node: typeof node === "string" ? node : JSON.stringify(node) },
  selected: false, readOnly: false, isViewer: false, nodeType: "readOnlyBlock",
  updateAttrs: async () => undefined, interactive: true, updatePending: false, updateError: null,
  setActive: () => undefined,
});

const wrap = (ui: React.ReactElement) =>
  render(
    <ReadOnlyAtomProvider value={{ colors: TOKENS.dark, labels, onLinkPress: () => undefined }}>
      {ui}
    </ReadOnlyAtomProvider>,
  );

it("draws a code block's card and preview from the atom", () => {
  const code: DocNode = { type: "codeBlock", attrs: { language: "ruby" }, content: [{ type: "text", text: "puts 1" }] };
  wrap(<ReadOnlyAtom {...props(code)} />);
  expect(screen.getByText("Code · ruby")).toBeTruthy();
  expect(screen.getByText("puts 1")).toBeTruthy();
});

it("draws a block it carries as the read view does, with no web link (owner, 2026-11-13)", () => {
  const p: DocNode = { type: "paragraph", content: [{ type: "text", text: "H" }, { type: "text", text: "2", marks: [{ type: "subscript" }] }, { type: "text", text: "O" }] };
  wrap(<ReadOnlyAtom {...props(p, "paragraph")} />);
  expect(screen.getByText("2")).toBeTruthy();
  expect(screen.queryByText(/web/i)).toBeNull();
});

it("a damaged payload still shows a card, never a crash or a blank", () => {
  wrap(<ReadOnlyAtom {...props("{oops", "table")} />);
  expect(screen.getByText("Unknown table")).toBeTruthy();
});
