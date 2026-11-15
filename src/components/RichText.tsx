/**
 * A server text field that may be rich text (Tiptap HTML from the web's
 * editor) or plain text typed before that, drawn in a DETAIL view.
 *
 * HTML goes through the Notes app's own native read renderer (`NoteDocument`,
 * parsed by `parseNoteHtml` via `src/lib/richText.ts`), so a contact's notes
 * read like a note: bold, lists, links, never the tags. Plain text is drawn
 * exactly as before. A one-line preview wants `htmlToPlainText` instead.
 */
import { useMemo } from "react";
import { View } from "react-native";

import { Text } from "@/components/reusables/text";
import { useColors } from "@/hooks/useColors";
import { isRichText, parseRichText } from "@/lib/richText";
import { NoteDocument } from "@/screens/notes/editor/NoteDocument";
import { openReadViewLink, useEditorLabels } from "@/screens/notes/readView";

export function RichText({ value, testID }: { value: string; testID?: string }) {
  const colors = useColors();
  const labels = useEditorLabels();
  const doc = useMemo(() => (isRichText(value) ? parseRichText(value) : null), [value]);

  if (!doc) return <Text testID={testID}>{value}</Text>;
  return (
    <View testID={testID}>
      <NoteDocument doc={doc} colors={colors} labels={labels} onLinkPress={openReadViewLink} />
    </View>
  );
}
