// EXPECTED TO FAIL LINT — FOUR TIMES, once per branch of the compound
// selector. A compound selector can have dead branches, which is the whole
// reason this directory exists. See README.md.
import { Pressable } from "react-native";

export function DirectLiteral() {
  return <Pressable accessibilityHint="Long press to react" />;
}

export function InsideAnExpression() {
  return <Pressable accessibilityLabel={"Delete this conversation"} />;
}

export function InsideAConditional({ can }: { can: boolean }) {
  return <Pressable accessibilityHint={can ? "Long press to react" : undefined} />;
}

export function InsideALogical({ name }: { name?: string }) {
  return <Pressable accessibilityLabel={name ?? "Someone in this conversation"} />;
}
