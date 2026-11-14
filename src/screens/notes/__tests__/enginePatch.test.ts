/**
 * GUARD (written after the patch, not test-first): the patch-package patch of
 * engine B that draws text colour, highlight, sub and sup while editing
 * (EDIT_EVERYTHING.md §2) is present, for B 2.2.3, on Android AND iOS. An
 * upgrade of B that drops or misnames it fails here instead of silently
 * showing plain text on a phone. Device check: the next QA pass.
 */
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "../../../..");
const patch = readFileSync(join(root, "patches/@apollohg+react-native-rich-text-editor+2.2.3.patch"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

it("targets the pinned engine version", () => {
  expect(pkg.dependencies["@apollohg/react-native-rich-text-editor"]).toBe("2.2.3");
});

it.each([
  ["Android", "RenderBridgeInlineAndAtoms.kt", ["\"fgColor\"", "\"highlight\"", "SubscriptSpan", "SuperscriptSpan"]],
  ["iOS", "RenderBridge+Atoms.swift", ["\"fgColor\"", "\"highlight\"", "\"subscript\", \"superscript\"", ".baselineOffset"]],
])("%s draws text colour, highlight, sub and sup", (_platform, file, needles) => {
  expect(patch).toContain(file);
  for (const needle of needles) expect(patch).toContain(needle);
});

it("reads the colour the app's glue sends (display, #rrggbb)", () => {
  expect(patch).toContain('optString("display"');
  expect(patch).toContain('markObject?["display"]');
});

// Device, 2026-11-14: after Format > Code block the caret jumped to the top of
// the note, so the next letters landed in the wrong block. The screen puts the
// caret back from B's scalar selection (anchorScalar/headScalar), but B 2.2.3
// strips those fields before onSelectionChange (publicSelection). The patch
// hands the whole selection over; Metro resolves B's src/ (react-native field).
it("onSelectionChange receives B's scalar caret (anchorScalar/headScalar)", () => {
  const events = readFileSync(join(root, "node_modules/@apollohg/react-native-rich-text-editor/src/useRichTextEditorEvents.tsx"), "utf8");
  expect(events).toContain("onSelectionChangeRef.current?.(selection);");
  expect(events).not.toContain("onSelectionChangeRef.current?.(publicSelection(selection));");
  expect(patch).toContain("src/useRichTextEditorEvents.tsx");
});

// Device, 2026-11-14: Enter twice to leave a checklist, then "Code block":
// nothing happened (before the toCodeBlockAt guard: a crash). B moves the
// caret through render updates (Enter, list commands) and updates only its
// own selectionRef there; onSelectionChange fires for native selection events
// only, so the screen kept a caret inside the checklist item. The patch
// reports a changed selection from updates too.
it("onSelectionChange also fires when a render update moves the caret", () => {
  const updates = readFileSync(join(root, "node_modules/@apollohg/react-native-rich-text-editor/src/useRichTextEditorUpdates.tsx"), "utf8");
  expect(updates).toContain("onSelectionChangeRef");
  expect(updates).toMatch(/reportSelection\(previous, update\.selection\)/);
  expect(updates).toMatch(/reportSelection\(previous, nextSelection\)/);
  expect(patch).toContain("src/useRichTextEditorUpdates.tsx");
});
