/**
 * The shared header spans the window on every screen (`Screen`'s `header`
 * slot). The owner: "the top must be identical everywhere".
 *
 * Measured 2026-11-20 at 800 dp (qa_phone3): screens that centre their
 * content in the 640 dp measure (`Screen measure`) drew `AppHeader` inside
 * that column. With a long title the five labelled buttons left it a few dp;
 * sizing the header from the column instead dropped the labels on those
 * screens only, so the header looked different from screen to screen. The
 * header now sits outside the column, full width, on every screen.
 *
 * What this proves: the slot is outside the measured column, and no screen
 * in `app/` puts `AppHeader` inside a measured `Screen` any more. What it
 * cannot: pixels. That is the 800 dp screenshots in
 * docs/design/app-shell/ours/.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { Screen } from "../ScreenContainer";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

/** Every ancestor's flattened style, from the node up to the root. */
function ancestorStyles(node: { parent: unknown; props: { style?: unknown } } | null) {
  const out: Record<string, unknown>[] = [];
  for (let n = node; n; n = n.parent as typeof n) out.push((StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>);
  return out;
}

it("draws the header outside the measured column, and the content inside it", () => {
  render(
    <Screen measure header={<Text testID="the-header">top</Text>}>
      <Text testID="the-body">body</Text>
    </Screen>,
  );
  const capped = (s: Record<string, unknown>) => typeof s.maxWidth === "number";
  expect(ancestorStyles(screen.getByTestId("the-body") as never).some(capped)).toBe(true);
  expect(ancestorStyles(screen.getByTestId("the-header") as never).some(capped)).toBe(false);
  // The header keeps the 16 dp gutter its own arithmetic assumes (`AppHeader` GUTTER).
  expect(screen.getByTestId("screen-header")).toHaveStyle({ paddingHorizontal: 16 });
});

it("draws the header above a scrolling body, so it stays put", () => {
  render(
    <Screen scroll header={<Text testID="the-header">top</Text>}>
      <Text>body</Text>
    </Screen>,
  );
  const names = ancestorStyles(screen.getByTestId("the-header") as never);
  expect(names.length).toBeGreaterThan(0);
  expect(screen.UNSAFE_queryAllByType(require("react-native").ScrollView).some((sv: { findAll: (f: (n: { props: { testID?: string } }) => boolean) => unknown[] }) => sv.findAll((n) => n.props.testID === "the-header").length > 0)).toBe(false);
});

// The source rule, so a new screen cannot bring the old layout back.
const APP = join(__dirname, "..", "..", "..", "app");
function tsxUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : tsxUnder(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

it("no screen in app/ draws AppHeader as a child of Screen: it goes in the header slot", () => {
  const offenders = tsxUnder(APP).flatMap((file) => {
    const lines = readFileSync(file, "utf8").split("\n");
    return lines.flatMap((line, i) => {
      if (!/^\s*<AppHeader\b/.test(line)) return [];
      // The nearest line above that is not blank: a `<Screen …>` opening means
      // the header was written inside the screen's (possibly measured) column.
      let j = i - 1;
      while (j >= 0 && !lines[j].trim()) j--;
      return j >= 0 && /^\s*<Screen\b[^/]*>\s*$/.test(lines[j]) ? [`${relative(APP, file)}:${i + 1}`] : [];
    });
  });
  expect(offenders).toEqual([]);
});
