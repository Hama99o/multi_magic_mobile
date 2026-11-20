/**
 * The page editor offers only what it can finish (parity #50): links, images
 * and code blocks are the note screen's own flows, so on a page those keys
 * are shown disabled rather than half-working.
 */
import { buildToolbar, type Command } from "@/screens/notes/editor/toolbarModel";
import { unsupported } from "../pageEditor";

const bar = buildToolbar({ marks: {}, nodes: { paragraph: true }, canUndo: false, canRedo: false, hasSelection: true, panel: null, focused: true });

it("refuses links, images and code blocks", () => {
  expect(unsupported({ kind: "link" } satisfies Command)).toBe(true);
  expect(unsupported({ kind: "sheet", sheet: "more" } satisfies Command)).toBe(true);
  expect(unsupported({ kind: "insert", value: "image" } satisfies Command)).toBe(true);
  expect(unsupported({ kind: "block", value: "codeBlock" } satisfies Command)).toBe(true);
  expect(unsupported({ kind: "panel", panel: "codeLanguage" } satisfies Command)).toBe(true);
});

it("keeps every plain formatting key the toolbar shows", () => {
  const offered = bar.keys.filter((k) => !unsupported(k.command));
  expect(offered.length).toBeGreaterThan(0);
  expect(unsupported({ kind: "mark", mark: "bold" } satisfies Command)).toBe(false);
  expect(unsupported({ kind: "block", value: "h2" } satisfies Command)).toBe(false);
  expect(unsupported({ kind: "undo" } satisfies Command)).toBe(false);
});
