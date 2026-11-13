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
