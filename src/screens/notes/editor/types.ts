/**
 * Shared types of the Notes editor parts (SPEC §E). These parts take props
 * only: no store, no API, no router, no i18n. They are meant to move into
 * `tiptop-editor/native` later, next to the schema they render.
 */
import type { Tokens } from "@/theme/tokens";

export type { DocMark, DocNode } from "@/vendor/tiptop-schema/types";

export type EditorColors = Pick<Tokens, "ground" | "surface" | "border" | "ink" | "inkMuted" | "accent" | "onAccent" | "danger">;
export type Dir = "ltr" | "rtl";
export type Align = null | "left" | "center" | "right" | "justify";

/** Strings the parts show, already translated by the screen. */
export interface EditorLabels {
  viewOnWeb: string;
  /** "Table · {rows} × {cols}" */
  table: (rows: number, cols: number) => string;
  code: (language: string | null) => string;
  legacyImage: string;
  embed: string;
  unknown: (type: string) => string;
  imageUnavailable: string;
  checked: string;
  unchecked: string;
}
