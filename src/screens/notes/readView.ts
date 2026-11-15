/**
 * What every native read view of stored HTML needs from the screen: the
 * translated strings of the editor parts, and what a tapped link does. Shared
 * by the note screen (`app/notes/note.tsx`) and `RichText` (contact notes).
 */
import { Linking } from "react-native";
import { useTranslation } from "react-i18next";

import type { EditorLabels } from "@/screens/notes/editor/types";

export function useEditorLabels(): EditorLabels {
  const { t } = useTranslation();
  return {
    table: (rows, cols) => t("notes.block.table", { rows, cols }),
    code: (language) => (language ? t("notes.block.codeIn", { language }) : t("notes.block.code")),
    legacyImage: t("notes.block.legacyImage"),
    embed: t("notes.block.embed"),
    unknown: (type) => t("notes.block.unknown", { type }),
    imageUnavailable: t("notes.block.imageUnavailable"),
    checked: t("notes.task.checked"),
    unchecked: t("notes.task.unchecked"),
  };
}

/** Only what the phone can open: a relative web link has no host here. */
export function openReadViewLink(href: string): void {
  if (/^(https?:|mailto:|tel:)/i.test(href)) void Linking.openURL(href).catch(() => undefined);
}
