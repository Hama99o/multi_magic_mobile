/**
 * Engine B's schema covers the web's document (plan §11). A node or mark the
 * glue sends that B's schema does not declare makes B refuse the whole note,
 * which only a device shows; this pins it in Jest. Types that travel as the
 * read-only atom (legacy markup, images), and textStyle (sent as fgColor),
 * are the exceptions. Tables are B's own (withTablesSchema, Tiptap names).
 */
// B's REAL schema builders (pure JS in its dist); only the native index is
// replaced, so this sees exactly the schema B is given on the phone.
// (By file path: the package's "exports" closes its dist to deep imports.)
jest.mock("@apollohg/react-native-rich-text-editor", () => {
  const { join } = jest.requireActual("path");
  const dist = (file: string) => join(__dirname, "../../../../node_modules/@apollohg/react-native-rich-text-editor/dist", file);
  return {
    defineSchema: jest.requireActual(dist("schemaDefinition.js")).defineSchema,
    withTablesSchema: jest.requireActual(dist("TableSchema.js")).withTablesSchema,
    withAtomsSchema: jest.requireActual(dist("atoms.js")).withAtomsSchema,
    defineAtomNode: jest.requireActual(dist("atoms.js")).defineAtomNode,
  };
});
jest.mock("../editor/ReadOnlyAtom", () => ({ ReadOnlyAtom: () => null }));

/* eslint-disable import/first */
import { getSchemaSpec } from "@/vendor/tiptop-schema";
import { notesEngineSchema } from "../editor/engineSchema";
import { ENGINE_COLOR_MARK } from "../editor/engineGlue";

const AS_ATOM = new Set(["imageUploader", "rawBlock"]);
type Spec = { name: string; attrs?: Record<string, unknown> };
const schema = notesEngineSchema as { nodes: Spec[] | Record<string, Spec>; marks: Spec[] | Record<string, Spec> };
const byName = (list: Spec[] | Record<string, Spec>): Record<string, Spec> =>
  Array.isArray(list) ? Object.fromEntries(list.map((n) => [n.name, n])) : list;
const spec = { nodes: byName(schema.nodes), marks: byName(schema.marks) };
const web = getSchemaSpec({ comments: true });

// B splits a heading by level into h1, h2, h3 nodes and projects them back to
// { type: "heading", attrs: { level } } in JSON (the spike: 23/23 notes equal).
const declared = (name: string) => (name === "heading" ? Boolean(spec.nodes.h1 && spec.nodes.h2 && spec.nodes.h3) : Boolean(spec.nodes[name]));

it("declares every node of the web's schema (comments profile) that is not sent as an atom", () => {
  const missing = web.nodes.map((n) => n.name).filter((name) => !AS_ATOM.has(name) && !declared(name));
  expect(missing).toEqual([]);
});

it("declares every mark (the text colour under its engine name)", () => {
  const missing = web.marks.map((m) => (m.name === "textStyle" ? ENGINE_COLOR_MARK : m.name)).filter((name) => !spec.marks[name]);
  expect(missing).toEqual([]);
});

it("keeps every attribute the web has on the nodes it declares (B drops undeclared ones)", () => {
  const lost: string[] = [];
  for (const node of web.nodes) {
    if (AS_ATOM.has(node.name)) continue;
    const engine = node.name === "heading" ? spec.nodes.h1 : spec.nodes[node.name];
    if (!engine) continue;
    // level is the heading split itself (h1/h2/h3), not an attribute in B.
    for (const attr of Object.keys(node.attrs)) if (!engine.attrs?.[attr] && !(node.name === "heading" && attr === "level")) lost.push(`${node.name}.${attr}`);
  }
  expect(lost).toEqual([]);
});
