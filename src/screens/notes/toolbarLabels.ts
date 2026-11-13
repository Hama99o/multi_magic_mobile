/**
 * The toolbar's accessibility labels, by key id (EditorToolbar's `labels`).
 * Literal keys, so the i18n key check sees every one of them.
 */
import type { TFunction } from "i18next";
import type { ToolbarLabels } from "./editor/EditorToolbar";

export function toolbarLabels(t: TFunction): ToolbarLabels {
  const textColors = {
    default: t("notes.toolbar.textColors.default"), gray: t("notes.toolbar.textColors.gray"), brown: t("notes.toolbar.textColors.brown"),
    orange: t("notes.toolbar.textColors.orange"), yellow: t("notes.toolbar.textColors.yellow"), green: t("notes.toolbar.textColors.green"),
    blue: t("notes.toolbar.textColors.blue"), purple: t("notes.toolbar.textColors.purple"), pink: t("notes.toolbar.textColors.pink"),
    red: t("notes.toolbar.textColors.red"),
  };
  const highlights = {
    default: t("notes.toolbar.highlights.default"), gray: t("notes.toolbar.highlights.gray"), brown: t("notes.toolbar.highlights.brown"),
    orange: t("notes.toolbar.highlights.orange"), yellow: t("notes.toolbar.highlights.yellow"), green: t("notes.toolbar.highlights.green"),
    blue: t("notes.toolbar.highlights.blue"), purple: t("notes.toolbar.highlights.purple"), pink: t("notes.toolbar.highlights.pink"),
    red: t("notes.toolbar.highlights.red"),
  };
  return {
    undo: t("notes.toolbar.undo"), redo: t("notes.toolbar.redo"), insert: t("notes.toolbar.insert"), format: t("notes.toolbar.format"),
    blockType: t("notes.toolbar.blockType"), hideKeyboard: t("notes.toolbar.hideKeyboard"),
    bold: t("notes.toolbar.bold"), italic: t("notes.toolbar.italic"), underline: t("notes.toolbar.underline"), strike: t("notes.toolbar.strike"),
    code: t("notes.toolbar.code"), subscript: t("notes.toolbar.subscript"), superscript: t("notes.toolbar.superscript"), link: t("notes.toolbar.link"),
    textColor: t("notes.toolbar.textColor"), highlight: t("notes.toolbar.highlight"),
    taskList: t("notes.toolbar.taskList"), bulletList: t("notes.toolbar.bulletList"), orderedList: t("notes.toolbar.orderedList"),
    indent: t("notes.toolbar.indent"), outdent: t("notes.toolbar.outdent"),
    "align:left": t("notes.toolbar.alignLeft"), "align:center": t("notes.toolbar.alignCenter"),
    "align:right": t("notes.toolbar.alignRight"), "align:justify": t("notes.toolbar.alignJustify"),
    "block:paragraph": t("notes.toolbar.paragraph"), "block:h1": t("notes.toolbar.h1"), "block:h2": t("notes.toolbar.h2"),
    "block:h3": t("notes.toolbar.h3"), "block:blockquote": t("notes.toolbar.blockquote"), "block:codeBlock": t("notes.toolbar.codeBlock"),
    "insert:horizontalRule": t("notes.toolbar.horizontalRule"), "insert:image": t("notes.toolbar.image"), "insert:table": t("notes.toolbar.table"),
    ...Object.fromEntries(Object.entries(textColors).map(([k, v]) => [`textColor:${k}`, v])),
    ...Object.fromEntries(Object.entries(highlights).map(([k, v]) => [`highlight:${k}`, v])),
  };
}
