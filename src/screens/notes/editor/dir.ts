/**
 * Right-to-left is decided per block from its first strong character, like
 * the web's `dir="auto"` (NoteEditor sets it on the editor). A Pashto line in
 * an English note reads right-to-left on its own (SPEC §C, RTL rule).
 */
import type { Dir, DocNode } from "./types";

// Hebrew, Arabic (incl. Pashto/Persian/Urdu letters), Syriac, Thaana, NKo,
// and the Arabic presentation forms.
const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0900-\u0DFF\u3040-\u30FF\u4E00-\u9FFF]/;

export function textOf(node: DocNode): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join("");
}

export function dirOf(text: string, fallback: Dir = "ltr"): Dir {
  for (const ch of text) {
    if (RTL.test(ch)) return "rtl";
    if (LTR.test(ch)) return "ltr";
  }
  return fallback;
}
