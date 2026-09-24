/**
 * THE ACCESSIBILITY SWEEP over what RENDERED, beside `a11y.test.tsx`'s scan
 * of the source (which proves every Pressable WRITTEN in app/ and src/ has
 * a name). This one sees what that cannot: names computed at runtime,
 * controls that come from shared components (`Button`, `Switch`, rows), and
 * strings that reach a screen reader as a raw key.
 *
 * Three questions, per rendered screen, sheet or state:
 * - every CONTROL has a name: a pressable (a host View with `onClick`) by
 *   its label or the text inside it, which a screen reader reads out; a
 *   `Switch` by its label only, since nothing ties it to the text beside it;
 *   a text field by its label or its placeholder;
 * - nothing SPOKEN is a raw key (`answer.bad`), which is what i18next
 *   returns for a key it does not have;
 * - a choice ANNOUNCES its state: a radio or checkbox carries
 *   `accessibilityState`, so "selected" is not only a colour.
 *
 * WHAT IT CANNOT SEE: touch-target size and focus order (no layout in
 * Jest); whether a name is RIGHT, only that there is one; and what TalkBack
 * actually says. Those are a device with TalkBack on (docs/CLAIMS_AUDIT.md).
 */
import { screen } from "@testing-library/react-native";

type Node = {
  type: unknown;
  props: Record<string, unknown>;
  children: (Node | string)[];
};

const RAW_KEY = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/;

/** Everything a screen reader could say for a node: its label, else the
 *  text and labels of what is inside it. */
function spokenInside(node: Node): string {
  const own = node.props.accessibilityLabel;
  if (typeof own === "string" && own.trim()) return own.trim();
  const parts: string[] = [];
  for (const child of node.children) {
    if (typeof child === "string") parts.push(child);
    else parts.push(spokenInside(child));
  }
  return parts.join(" ").trim();
}

function describe(node: Node): string {
  const id = node.props.testID;
  return `${String(node.type)}${typeof id === "string" ? `#${id}` : ""}`;
}

export function a11yFindings(): string[] {
  const findings: string[] = [];
  const all = screen.UNSAFE_root.findAll((n: { type: unknown }) => typeof n.type === "string", { deep: true }) as unknown as Node[];
  for (const node of all) {
    const p = node.props;
    const isPressable = typeof p.onClick === "function" && p.accessible !== false;
    if (isPressable && !spokenInside(node)) findings.push(`nameless control: ${describe(node)}`);
    if (node.type === "RCTSwitch" && !(typeof p.accessibilityLabel === "string" && p.accessibilityLabel.trim())) {
      findings.push(`nameless switch: ${describe(node)}`);
    }
    if (node.type === "TextInput") {
      const name = [p.accessibilityLabel, p.placeholder].find((v) => typeof v === "string" && v.trim());
      if (!name) findings.push(`nameless field: ${describe(node)}`);
    }
    for (const v of [p.accessibilityLabel, p.accessibilityHint, p.placeholder]) {
      if (typeof v === "string" && RAW_KEY.test(v.trim())) findings.push(`raw key spoken: "${v}" on ${describe(node)}`);
    }
    if (node.type === "Text") {
      const text = node.children.filter((c) => typeof c === "string").join("").trim();
      if (RAW_KEY.test(text)) findings.push(`raw key shown: "${text}"`);
    }
    // WHICH state, not whether there is one: Pressable hands its host an
    // `accessibilityState` object even when none was written, so "is it
    // there" passed a radio that says nothing (found by planting exactly
    // that). A radio or checkbox must say selected or checked.
    if (p.accessibilityRole === "radio" || p.accessibilityRole === "checkbox") {
      const state = (p.accessibilityState ?? {}) as Record<string, unknown>;
      if (typeof state.selected !== "boolean" && state.checked === undefined) {
        findings.push(`state not announced: ${describe(node)}`);
      }
    }
  }
  return [...new Set(findings)];
}
