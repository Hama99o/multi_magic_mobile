/**
 * The read view never drops content: every text of the document is on
 * screen, and every block the phone cannot show as the web does becomes a
 * card with "View on web". The documents come from the stored-HTML shapes the
 * codec is proven on in tiptop-editor (web 2.3.1 output, server-written
 * markdown, legacy markup).
 */
import React from "react";
import { StyleSheet } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { TOKENS } from "@/theme/tokens";
import { NoteDocument } from "../editor/NoteDocument";
import type { DocNode, EditorLabels } from "../editor/types";
import { parseNoteHtml } from "../document";

// expo-image's native view has no host component under Jest: a plain View
// with the same props, so a test can fire its onError.
jest.mock("expo-image", () => {
  const { View } = jest.requireActual("react-native");
  const ReactActual = jest.requireActual("react");
  return { Image: (props: Record<string, unknown>) => ReactActual.createElement(View, props) };
});

const labels: EditorLabels = {
  viewOnWeb: "View on web",
  table: (r, c) => `Table · ${r} × ${c}`,
  code: (l) => (l ? `Code · ${l}` : "Code"),
  legacyImage: "Old image",
  embed: "Video",
  unknown: (t) => `Unknown ${t}`,
  imageUnavailable: "No image",
  checked: "Done",
  unchecked: "Not done",
};

const SHAPES: Record<string, string> = {
  "web 2.3.1": '<h2 style="text-align: center">Trip</h2><p>Book the <strong>Thursday</strong> flight and <a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com">pay</a> <span style="color: rgb(255, 0, 0)">red</span> <mark>hl</mark> H<sub>2</sub>O</p><ul><li><p>gifts</p><ul><li><p>nested</p></li></ul></li></ul><ol start="3"><li><p>third</p></li></ol><ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>passport</p></div></li><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>visa</p></div></li></ul><blockquote><p>quoted</p></blockquote><div data-type="horizontalRule"><hr></div><pre><code class="language-js">const a = 1</code></pre><table style="min-width: 50px"><colgroup><col style="min-width: 25px"><col style="min-width: 25px"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>Month</p></th><th colspan="1" rowspan="1"><p>Paid</p></th></tr><tr><td colspan="1" rowspan="1"><p>Sept</p></td><td colspan="1" rowspan="1"><p>12 000</p></td></tr></tbody></table><div id="i1" src="https://example.com/x.png" progress="100" failed="false" uploading="false" selectmedia="false" data-type="image-uploader" data-uploading="false"></div><p>hi <span data-name="smile" data-type="emoji">😄</span></p>',
  "server markdown": "<h1>Plan</h1><p>Line one<br>line two with <code>code</code> and <s>gone</s></p><ul><li><p>one</p></li></ul><blockquote><p>quote</p></blockquote><hr><p>a &amp; b &lt; c</p>",
  legacy: '<div data-type="draggable-item"><p>in drag</p></div><img src="https://example.com/a.png" data-width="300"><p>text <img src="https://example.com/c.png"> more</p><iframe src="https://www.youtube.com/embed/abc123XYZ"></iframe><h4>four</h4>',
  rtl: "<p>د سفر لپاره لیست</p><p>English line</p>",
  empty: "",
};

function texts(node: DocNode): string[] {
  if (node.type === "text") return [node.text ?? ""];
  if (node.type === "table" || node.type === "codeBlock") return []; // shown in their card, checked below
  return (node.content ?? []).flatMap(texts);
}

const renderDoc = (html: string, onViewOnWeb = jest.fn(), onLinkPress = jest.fn()) => {
  const { doc } = parseNoteHtml(html);
  render(<NoteDocument doc={doc} colors={TOKENS.light} labels={labels} onLinkPress={onLinkPress} onViewOnWeb={onViewOnWeb} />);
  return doc;
};

describe("NoteDocument", () => {
  it.each(Object.entries(SHAPES))("%s: every text is on screen", (_name, html) => {
    const doc = renderDoc(html);
    for (const text of texts(doc).map((t) => t.trim()).filter(Boolean)) {
      expect(screen.getAllByText(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).length).toBeGreaterThan(0);
    }
  });

  it("shows tables and code as cards with their content", () => {
    renderDoc(SHAPES["web 2.3.1"]);
    expect(screen.getByText("Table · 2 × 2")).toBeTruthy();
    expect(screen.getByText("12 000")).toBeTruthy();
    expect(screen.getByText("Code · js")).toBeTruthy();
    expect(screen.getByText("const a = 1")).toBeTruthy();
  });

  it("shows task states to screen readers", () => {
    renderDoc(SHAPES["web 2.3.1"]);
    expect(screen.getByRole("checkbox", { checked: true })).toBeTruthy();
    expect(screen.getByRole("checkbox", { checked: false })).toBeTruthy();
  });

  it("keeps what the web drops: legacy images and videos become cards that open the right page", () => {
    const onViewOnWeb = jest.fn();
    renderDoc(SHAPES.legacy, onViewOnWeb);
    expect(screen.getByText("Old image")).toBeTruthy();
    expect(screen.getByText("Video")).toBeTruthy();
    expect(screen.getByText("[Old image]", { exact: false })).toBeTruthy(); // the inline one
    // Two block cards (the top-level image and the video); the inline image is a chip in its line.
    const buttons = screen.getAllByText("View on web");
    expect(buttons).toHaveLength(2);
    fireEvent.press(buttons[1]);
    expect(onViewOnWeb).toHaveBeenLastCalledWith("https://www.youtube.com/watch?v=abc123XYZ");
  });

  it("opens links through the screen", () => {
    const onLinkPress = jest.fn();
    renderDoc(SHAPES["web 2.3.1"], jest.fn(), onLinkPress);
    fireEvent.press(screen.getByText("pay"));
    expect(onLinkPress).toHaveBeenCalledWith("https://example.com");
  });

  it("renders the emoji character", () => {
    renderDoc(SHAPES["web 2.3.1"]);
    expect(screen.getByText("😄")).toBeTruthy();
  });

  it("an unknown node type is a card with its text, never dropped", () => {
    const doc: DocNode = { type: "doc", content: [{ type: "callout", content: [{ type: "paragraph", content: [{ type: "text", text: "future block" }] }] }] };
    render(<NoteDocument doc={doc} colors={TOKENS.light} labels={labels} onLinkPress={jest.fn()} onViewOnWeb={jest.fn()} />);
    expect(screen.getByText("Unknown callout")).toBeTruthy();
    expect(screen.getByText("future block")).toBeTruthy();
  });

  // Device QA 2026-11-12, a real Pashto note: the text read right-to-left but
  // its bullets, numbers and boxes stayed on the left. The marker follows
  // the item's own direction, as the web's dir="auto" does (SPEC §C11 RTL).
  it("puts list markers, boxes and the quote bar on the right of a right-to-left item", () => {
    renderDoc(
      '<ul><li><p>لومړی توکی</p></li><li><p>English item</p></li></ul>' +
      '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>دوهم توکی</p></div></li></ul>' +
      "<blockquote><p>د سفر لپاره لیست</p></blockquote>",
    );
    const dirs = (id: string) => screen.getAllByTestId(id).map((el) => StyleSheet.flatten(el.props.style).flexDirection);
    expect(dirs("note-list-item")).toEqual(["row-reverse", "row"]);
    expect(dirs("note-task-item")).toEqual(["row-reverse"]);
    const quote = StyleSheet.flatten(screen.getByTestId("note-quote").props.style);
    expect(quote.borderRightWidth).toBe(3);
    expect(quote.borderLeftWidth ?? 0).toBe(0);
  });

  // Device QA 2026-11-12: an image whose server copy is gone drew a blank box.
  it("says the image is unavailable when it fails to load", () => {
    renderDoc('<div data-type="image-uploader" src="https://example.com/gone.png" uploading="false"></div>');
    act(() => screen.getByTestId("note-image").props.onError({ error: "404" }));
    expect(screen.getByText("No image")).toBeTruthy();
  });
});
