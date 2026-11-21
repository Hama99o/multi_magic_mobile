/**
 * FONT SCALE 200 % (the hidden-criteria sweep, Hello 2026-11-21): no text is
 * clipped in a Tables box of FIXED height, the card and the grid row, whose
 * heights are fixed so a recycled list cell never changes size (the owner's
 * rule) and `getItemLayout` stays exact.
 *
 * The rule checked, per rendered Text: its line height, scaled the way the
 * platform scales it (`fontScale`, capped by `maxFontSizeMultiplier`, none
 * when `allowFontScaling` is false), fits the nearest box with a fixed
 * `height` around it. Jest has no layout engine, so this reads the styles:
 * it proves the arithmetic, not the pixels (a device at 200 % does that,
 * flows 31 and 36).
 */
import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { ReactElement } from "react";
import type { FieldDefinition, FieldType } from "@/api/fields";
import type { RecordRow } from "@/api/tables";
import { RecordCard, cardLayout } from "../RecordCard";
import { GridView } from "../GridView";
import { FONT_CAP } from "@/components/fields/CardValue";

const SCALE = 2; // Android's largest setting, 200 %

beforeEach(() => {
  jest.spyOn(require("react-native"), "useWindowDimensions").mockReturnValue({ width: 1024, height: 768, scale: 2, fontScale: SCALE });
});

const def = (id: number, name: string, fieldType: FieldType, options: { value: string; label: string; color: string }[] = []): FieldDefinition => ({
  id,
  name,
  key: `f${id}`,
  fieldType,
  recordClass: null,
  tagCategoryId: null,
  position: id,
  required: false,
  config: { options, min: null, max: null, allowCreate: false, scope: null, raw: {} },
  ownerType: "TableApp::Table",
  ownerId: 10,
});
const title = def(1, "Name", "text");
const fields = [def(2, "Status", "single_select", [{ value: "in", label: "In stock", color: "#10b981" }]), def(3, "Price", "decimal"), def(4, "Paid", "boolean")];
const row: RecordRow = {
  id: 501,
  position: 0,
  createdAt: "2026-11-21T00:00:00Z",
  updatedAt: "2026-11-21T00:00:00Z",
  values: { 1: { kind: "scalar", value: "Blue scarf" }, 2: { kind: "scalar", value: "in" }, 3: { kind: "scalar", value: 12.5 }, 4: { kind: "scalar", value: true } },
  linkLabels: {},
  linkCounts: {},
} as unknown as RecordRow;
const known = () => [];

type Host = { type: unknown; props: Record<string, unknown>; parent: Host | null; children: (Host | string)[] };

/** Every Text whose scaled line height overflows the fixed-height box it sits in. */
function clipped(root: Host, fontScale = SCALE): string[] {
  const out: string[] = [];
  const walk = (n: Host | string) => {
    if (typeof n === "string") return;
    if (n.type === "Text") {
      const own = StyleSheet.flatten(n.props.style as never) as { lineHeight?: number; fontSize?: number; height?: number } | undefined;
      const line = own?.lineHeight ?? Math.ceil((own?.fontSize ?? 14) * 1.2);
      const cap = n.props.allowFontScaling === false ? 1 : Math.min(fontScale, (n.props.maxFontSizeMultiplier as number | undefined) ?? Infinity);
      const scaled = line * cap;
      let box: number | undefined = own?.height;
      for (let p = n.parent; box === undefined && p; p = p.parent) {
        const h = (StyleSheet.flatten(p.props.style as never) as { height?: unknown } | undefined)?.height;
        if (typeof h === "number") box = h;
      }
      const text = n.children.filter((c) => typeof c === "string").join("");
      if (box !== undefined && scaled > box) out.push(`"${text}": ${scaled} in ${box}`);
    }
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

const host = (ui: ReactElement) => render(ui).UNSAFE_root as unknown as Host;
const texts = (root: Host, wanted: string): number => {
  let n = 0;
  const walk = (x: Host | string) => {
    if (typeof x === "string") return;
    if (x.type === "Text" && x.children.filter((c) => typeof c === "string").join("") === wanted) n += 1;
    x.children.forEach(walk);
  };
  walk(root);
  return n;
};

it("a card at 200 %: nothing clipped, and its height is the one getItemLayout uses", () => {
  const height = cardLayout(fields.length, false, SCALE);
  const root = host(<RecordCard row={row} index={0} title={title} fields={fields} colorField={null} coverField={null} known={known} height={height} onPress={() => undefined} />);
  expect(clipped(root)).toEqual([]);
  // The card grows with the font, up to the cap, and no further.
  expect(cardLayout(fields.length, false, SCALE)).toBeGreaterThan(cardLayout(fields.length, false, 1));
  expect(cardLayout(fields.length, false, 3)).toBe(cardLayout(fields.length, false, FONT_CAP));
});

it("a card at 100 % clips nothing either", () => {
  jest.spyOn(require("react-native"), "useWindowDimensions").mockReturnValue({ width: 411, height: 900, scale: 2, fontScale: 1 });
  const root = host(<RecordCard row={row} index={0} title={title} fields={fields} colorField={null} coverField={null} known={known} height={cardLayout(fields.length, false, 1)} onPress={() => undefined} />);
  expect(clipped(root, 1)).toEqual([]);
});

it("the tablet grid at 200 %: header, rows and the summary bar clip nothing; a cell is its value alone", () => {
  const root = host(
    <GridView rows={[row]} title={title} fields={fields} primaryFieldId={1} widths={{}} known={known} summary={{ 2: { filled: 1, sum: null, avg: null }, 3: { filled: 1, sum: 12.5, avg: 12.5 } }} totalRows={1} onOpen={() => undefined} onEndReached={() => undefined} />,
  );
  expect(clipped(root)).toEqual([]);
  // The header names a column once; a cell does not repeat the name above its value.
  expect(texts(root, "Status")).toBe(1);
  expect(texts(root, "Name")).toBe(1);
});
