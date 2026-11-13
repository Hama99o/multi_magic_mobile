/**
 * DOES ENGINE B REALLY HOLD THE NOTE WE GAVE IT? (device, 2026-11-13)
 *
 * A 900 KB note was accepted by createNativeEditorDocumentHandle without an
 * error and then shown EMPTY ("Write something"). Typing into that view would
 * have produced a near-empty document, and a save of it would have replaced
 * the note. So before the editor is shown, the engine's own copy is checked:
 * not empty when ours is not, and no fewer top-level blocks (B may add one,
 * e.g. a paragraph after a final table; losing one is what loses text). If it
 * fails, the screen shows the read view and sends nothing (the "refused" path).
 */
import type { DocNode } from "@/vendor/tiptop-schema";

interface BridgeLike {
  getDocumentIsEmpty?(): boolean;
  getDocumentJson?(): unknown;
}

const hasContent = (doc: DocNode) =>
  (doc.content ?? []).some((n) => (n.content?.length ?? 0) > 0 || (n.type !== "paragraph" && n.type !== "text"));

export function engineHolds(bridge: BridgeLike | null | undefined, given: DocNode): { ok: true } | { ok: false; reason: string } {
  if (!bridge?.getDocumentIsEmpty || !bridge.getDocumentJson) return { ok: false, reason: "the engine cannot be read back" };
  try {
    if (hasContent(given) && bridge.getDocumentIsEmpty()) return { ok: false, reason: "the engine holds an empty document" };
    const held = bridge.getDocumentJson() as DocNode | null;
    const want = given.content?.length ?? 0;
    const got = held?.content?.length ?? 0;
    if (got < want) return { ok: false, reason: `the engine holds ${got} top-level blocks of ${want}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
