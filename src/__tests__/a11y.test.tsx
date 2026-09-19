/**
 * THE FIRST TEST IN THIS REPO THAT READS THE ACCESSIBILITY TREE.
 *
 * Every other gate here is pointed at something else. `keys.test.ts` resolves
 * the keys the app ASKS for. `locales.test.ts` compares the two locales to each
 * other. `screens.render.test.tsx` reads `testID`s and visible text — and an
 * `accessibilityLabel` is neither. The eslint rule added with `49a0a7a` rejects
 * a bare worded literal in `accessibilityLabel` or `accessibilityHint`, which
 * catches exactly one class: a label that exists and was never translated.
 *
 * So the questions below had never been asked at all.
 *
 * ── WHAT A GREEN HERE DOES NOT MEAN ───────────────────────────────────────
 * Read this before citing this file as coverage; `docs/TESTING.md` §6 is about
 * a verdict that travelled further than the run behind it.
 *
 *  - **It does not mean the gestures work.** `06-people-chat` failed on a long
 *    press that carries a correct, translated `accessibilityHint` and a correct
 *    handler: Android's text-selection ActionMode took the gesture first and
 *    the app's `onLongPress` never ran. Both halves are present and right in
 *    the tree, so no static check and no render test can see it — only the OS
 *    knows what it consumed. Announced gestures are listed in
 *    `docs/ACCESSIBILITY.md` for a device to close, not asserted here.
 *  - **It does not mean anything is reachable.** A `Pressable` is an
 *    accessibility element by default (`Pressable.js:245`,
 *    `accessible: accessible !== false`), and on iOS an accessibility element
 *    GROUPS its children into one. RNTL does not emulate that grouping, so a
 *    query here finds nested controls that VoiceOver would never reach. The
 *    two scrim-wrapped sheets are in the audit, not in this file.
 *  - **It does not mean anything is legible or big enough.** Jest has no layout
 *    engine. Touch targets are measured from the source in the audit and
 *    settled on a device.
 *
 * What it does mean is narrow and worth having: **nothing a person can press
 * is nameless, and the two names that are computed rather than written are
 * still there when the component changes shape.**
 */
import { render, screen } from "@testing-library/react-native";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import fs from "node:fs";
import path from "node:path";
import { Button } from "@/components/reusables/button";
import { Input } from "@/components/reusables/input";
import { Markdown } from "@/screens/account/Markdown";

// ── The backward walk ──────────────────────────────────────────────────────
// "Is what we call defined?" was the only question any gate here asked. This is
// the other one: what does the screen DRAW that nothing names? The answer is a
// list you can read, which is why it is the cheaper question — docs/TESTING.md §8.
const ROOT = path.resolve(__dirname, "../..");
const INTERACTIVE = new Set(["Pressable", "TouchableOpacity", "TouchableHighlight"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__" && entry.name !== "node_modules") sourceFiles(full, out);
    } else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const tagName = (node: any): string =>
  node?.type === "JSXIdentifier"
    ? node.name
    : node?.type === "JSXMemberExpression"
      ? `${tagName(node.object)}.${tagName(node.property)}`
      : "?";

/**
 * A control is NAMED if it carries an explicit label, or if its subtree renders
 * text — React Native derives the accessible name from descendant text when no
 * label is given. A nested control is skipped: it has its own name and does not
 * lend it to the parent.
 */
function rendersOwnText(node: any): boolean {
  let found = false;
  const visit = (n: any) => {
    if (found || !n || typeof n !== "object") return;
    if (n.type === "JSXElement") {
      const tag = tagName(n.openingElement.name);
      if (INTERACTIVE.has(tag) || tag === "Button") return;
      // The repo's own Button/Input take their name as a `label` prop.
      if (/^(Text|Inline)$/.test(tag) || tag.endsWith("Text")) {
        found = true;
        return;
      }
    }
    if (n.type === "JSXText" && n.value.trim()) {
      found = true;
      return;
    }
    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "openingElement") continue;
      const value = (n as any)[key];
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value.type === "string") visit(value);
    }
  };
  (node.children ?? []).forEach(visit);
  return found;
}

function unnamedControls(): string[] {
  const findings: string[] = [];
  for (const dir of ["app", "src"]) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      const code = fs.readFileSync(file, "utf8");
      const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
      (traverse as any).default?.(ast, visitor(file, code, findings)) ??
        (traverse as any)(ast, visitor(file, code, findings));
    }
  }
  return findings;
}

function visitor(file: string, code: string, findings: string[]) {
  return {
    JSXElement(p: any) {
      const el = p.node.openingElement;
      const tag = tagName(el.name);
      if (!INTERACTIVE.has(tag)) return;
      const props = new Set(
        el.attributes.filter((a: any) => a.type === "JSXAttribute").map((a: any) => a.name.name),
      );
      // Not a control: no press handler of any kind.
      const pressable = ["onPress", "onLongPress", "onPressIn"].some((h) => props.has(h));
      if (!pressable) return;
      if (props.has("accessibilityLabel") || props.has("aria-label")) return;
      if (rendersOwnText(p.node)) return;
      /**
       * `accessible={false}` is an ANSWER to this check, not an exemption from
       * it: it takes the element out of the accessibility tree entirely, so
       * there is no nameless focus stop left to find. The press-swallowing
       * containers inside the two sheets are the real case — they exist only to
       * stop a press reaching the scrim and were never meant to be controls.
       *
       * Deliberately no allowlist anywhere else. A control kept on a list of
       * known-nameless controls is a control nobody can tell from one that was
       * forgotten, which is `docs/TESTING.md` §8's argument about dead keys.
       */
      const accessibleAttr = el.attributes.find(
        (a: any) => a.type === "JSXAttribute" && a.name.name === "accessible",
      );
      if (
        accessibleAttr?.value?.type === "JSXExpressionContainer" &&
        accessibleAttr.value.expression.type === "BooleanLiteral" &&
        accessibleAttr.value.expression.value === false
      ) {
        return;
      }
      findings.push(`${path.relative(ROOT, file)}:${el.loc.start.line} <${tag}>`);
    },
  };
}

describe("every control a person can press has a name", () => {
  it("finds no nameless Pressable in app/ or src/", () => {
    expect(unnamedControls()).toEqual([]);
  });
});

/**
 * ── THE CHECK THAT THE OBVIOUS TEST CANNOT BE ─────────────────────────────
 *
 * A name on a container is a GROUPING change: an accessibility element groups
 * its children, so naming a wrapper hides every control inside it. That is
 * `docs/ACCESSIBILITY.md` N1, and it is also the shape an accessibility FIX
 * takes when somebody wants to attribute or describe a region.
 *
 * `announce.test.tsx` has a test asserting a link inside an answer is still
 * reachable after the answer was attributed. **That test does not catch this,
 * and it was verified not to**: the naive container fix was planted and it
 * stayed green. RNTL builds a JS tree and does not emulate the native grouping,
 * so a query finds children that VoiceOver would never reach. A render test
 * cannot see this class at all, which is why the check is static.
 */
function namedContainersHidingControls(): string[] {
  const findings: string[] = [];
  for (const dir of ["app", "src"]) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      const code = fs.readFileSync(file, "utf8");
      const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
      const visit = {
        JSXElement(p: any) {
          const el = p.node.openingElement;
          const tag = tagName(el.name);
          const attr = (k: string) =>
            el.attributes.find((a: any) => a.type === "JSXAttribute" && a.name.name === k);
          const named = Boolean(attr("accessibilityLabel"));
          if (!named) return;
          // An accessibility element: a Pressable (true by default) or anything
          // explicitly marked `accessible` / `accessible={true}`.
          const acc = attr("accessible");
          const explicit =
            acc && (acc.value === null || acc.value?.expression?.value === true);
          if (!INTERACTIVE.has(tag) && !explicit) return;

          let buried = false;
          const look = (n: any, top = false) => {
            if (buried || !n || typeof n !== "object") return;
            if (!top && n.type === "JSXElement") {
              const child = tagName(n.openingElement.name);
              const role = n.openingElement.attributes.find(
                (a: any) => a.type === "JSXAttribute" && a.name.name === "accessibilityRole",
              );
              const roleValue = role?.value?.value;
              if (INTERACTIVE.has(child) || child === "Button" || roleValue === "link") {
                buried = true;
                return;
              }
            }
            for (const key of Object.keys(n)) {
              if (key === "loc") continue;
              const value = (n as any)[key];
              if (Array.isArray(value)) value.forEach((c: any) => look(c));
              else if (value && typeof value.type === "string") look(value);
            }
          };
          look(p.node, true);
          if (buried) findings.push(`${path.relative(ROOT, file)}:${el.loc.start.line} <${tag}>`);
        },
      };
      (traverse as any).default?.(ast, visit) ?? (traverse as any)(ast, visit);
    }
  }
  return findings;
}

describe("a name on a container hides the controls inside it", () => {
  /**
   * The five entries below are `docs/ACCESSIBILITY.md` N1: EVERY modal sheet in
   * this app dismisses through a full-screen Pressable labelled "Close" that has
   * the sheet's own contents as its children. It is NOT fixed here — the repair is structural, it changes two modals whose
   * `ours/` screenshots are part of their DONE, and there is no iOS in this rig
   * to watch it with. So they are pinned rather than hidden.
   *
   * Three of the five were found by THIS check and not by the hand-read that
   * wrote N1 up — the first pass grepped for the press-swallowing child and
   * SourceSheet stops propagation instead, so it looked different while being
   * the same. That is the argument for the static walk in one line.
   *
   * This is a debt register, not an allowlist. Every site is written up with a
   * reason and an owner, and the point of pinning them is that a THIRD one, or
   * an `accessible` added to any container, turns this red immediately — which
   * is the case that arrives disguised as an accessibility fix.
   */
  it("finds only the five sheet scrims written up as N1", () => {
    expect(namedContainersHidingControls().sort()).toEqual(
      [
        "src/components/chat/AttachSheet.tsx:56 <Pressable>",
        "src/components/chat/SourceSheet.tsx:45 <Pressable>",
        "src/components/sessions/SessionsSheet.tsx:304 <Pressable>",
        "src/screens/account/PhotoSheet.tsx:103 <Pressable>",
        "src/screens/people/ReactionSheet.tsx:87 <Pressable>",
      ].sort(),
    );
  });
});

// ── The names that are computed, not written ───────────────────────────────
describe("a computed name survives the component changing shape", () => {
  it("Button keeps its name while busy", () => {
    // The name comes from the label Text. `busy` swaps that Text for a spinner,
    // so the name vanished at exactly the moment a person most needs to know
    // what they pressed — and `accessibilityState.busy` alone does not say it.
    render(<Button label="Check and save" busy testID="b" />);
    expect(screen.getByTestId("b")).toHaveAccessibleName("Check and save");
  });

  it("Button still keeps its name when idle", () => {
    render(<Button label="Check and save" testID="b" />);
    expect(screen.getByTestId("b")).toHaveAccessibleName("Check and save");
  });
});

// ── Headings ───────────────────────────────────────────────────────────────
describe("a long document can be navigated by heading", () => {
  /**
   * The privacy policy is a store requirement and the only long document in the
   * app. Swipe-by-heading is how anybody reads one with a screen reader; a
   * heading that is only a larger font is not a heading to anything but an eye.
   */
  it("Markdown gives every heading the header role", () => {
    render(
      <Markdown source={"# What we keep\n\nSome words.\n\n## Your questions\n\nMore words.\n\n### Retention\n\nEnd."} />,
    );
    expect(screen.getAllByRole("header").map((n) => n.props.children)).toHaveLength(3);
  });
});

// ── State changes nobody is told about ─────────────────────────────────────
describe("a field error is announced, not just drawn", () => {
  it("Input marks its error as a live region", () => {
    render(<Input label="Email" error="That email and password do not match" errorTestID="e" />);
    expect(screen.getByTestId("e").props.accessibilityLiveRegion).toBe("polite");
  });
});
