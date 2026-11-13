/**
 * Engine B's schema covers the web's document (plan §11). A node or mark the
 * glue sends that B's schema does not declare makes B refuse the whole note,
 * which only a device shows; this pins it in Jest. Types that travel as the
 * read-only atom, and textStyle (sent as fgColor), are the exceptions.
 */
jest.mock("@apollohg/react-native-rich-text-editor", () => ({
  defineSchema: (s: unknown) => s,
  withAtomsSchema: (s: unknown) => s,
  defineAtomNode: (c: Record<string, unknown>) => ({ ...c, nodeSpec: { name: c.name } }),
}));
jest.mock("../editor/ReadOnlyAtom", () => ({ ReadOnlyAtom: () => null }));

/* eslint-disable import/first */
import { getSchemaSpec } from "@/vendor/tiptop-schema";
import { notesEngineSchema } from "../editor/engineSchema";
import { ENGINE_COLOR_MARK } from "../editor/engineGlue";

const AS_ATOM = new Set(["table", "tableRow", "tableCell", "tableHeader", "imageUploader", "rawBlock"]);
const spec = notesEngineSchema as { nodes: Record<string, { attrs?: Record<string, unknown> }>; marks: Record<string, { attrs?: Record<string, unknown> }> };
const web = getSchemaSpec({ comments: true });

it("declares every node of the web's schema (comments profile) that is not sent as an atom", () => {
  const missing = web.nodes.map((n) => n.name).filter((name) => !AS_ATOM.has(name) && !spec.nodes[name]);
  expect(missing).toEqual([]);
});

it("declares every mark (the text colour under its engine name)", () => {
  const missing = web.marks.map((m) => (m.name === "textStyle" ? ENGINE_COLOR_MARK : m.name)).filter((name) => !spec.marks[name]);
  expect(missing).toEqual([]);
});

it("keeps every attribute the web has on the nodes it declares (B drops undeclared ones)", () => {
  const lost: string[] = [];
  for (const node of web.nodes) {
    if (AS_ATOM.has(node.name) || !spec.nodes[node.name]) continue;
    for (const attr of Object.keys(node.attrs)) if (!spec.nodes[node.name].attrs?.[attr]) lost.push(`${node.name}.${attr}`);
  }
  expect(lost).toEqual([]);
});
