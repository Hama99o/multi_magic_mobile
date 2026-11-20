/**
 * One row as a card (SPEC C2): the title, then up to three fields, label above
 * value; the row colour as a bar on the leading edge; in a gallery, the cover
 * image on top. Its height is FIXED (`cardLayout`), computed from the view, so
 * the list's `getItemLayout` holds and a recycled cell never changes size. No
 * Reanimated here: the owner's rule for recycled list cells.
 */
import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { FieldDefinition } from "@/api/fields";
import type { RecordRow } from "@/api/tables";
import { CARD_LABEL_HEIGHT, CARD_VALUE_HEIGHT, CardValue } from "@/components/fields/CardValue";
import { displayValue, optionsFor, type KnownRecords } from "@/components/fields/display";
import { Text } from "@/components/reusables/text";
import { Check } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { colorHex } from "@/screens/flow/logic";

export const CARD_PAD = 12;
export const CARD_TITLE = 22;
export const CARD_GAP = 6;
export const COVER_HEIGHT = 140;
/** Space between two cards, inside the item so `getItemLayout` is exact. */
export const CARD_SPACING = 8;

/** The card's height for a view: fixed, whatever the row holds. */
export function cardLayout(fieldCount: number, cover: boolean): number {
  const fields = fieldCount * (CARD_LABEL_HEIGHT + CARD_VALUE_HEIGHT + CARD_GAP);
  return CARD_PAD * 2 + CARD_TITLE + fields + (cover ? COVER_HEIGHT : 0) + CARD_SPACING;
}

export function RecordCard({
  row,
  index,
  title,
  fields,
  colorField,
  coverField,
  known,
  height,
  onPress,
  onLongPress,
  testID,
  selected,
}: {
  row: RecordRow;
  index: number;
  title: FieldDefinition | null;
  fields: FieldDefinition[];
  colorField: FieldDefinition | null;
  coverField: FieldDefinition | null;
  known: KnownRecords;
  height: number;
  onPress: () => void;
  /** Kanban's "Move to…" (increment 4). */
  onLongPress?: () => void;
  testID?: string;
  /** In select mode: true or false; undefined when not selecting. */
  selected?: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [pressed, setPressed] = useState(false);
  const titleText = (title && displayValue(title, row.values[title.id], known, i18n.language)) || t("tables.untitled");
  const bar = colorField ? colorHex(optionsFor(colorField, row.values[colorField.id])[0]?.color) : null;
  const coverValue = coverField ? row.values[coverField.id] : undefined;
  const cover = coverValue?.kind === "files" ? coverValue.files.find((f) => f.contentType?.startsWith("image/") && f.url) : undefined;

  return (
    <View style={{ height, paddingBottom: CARD_SPACING }}>
      <Pressable
        testID={testID ?? `tables-card-${index}`}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        accessibilityRole={selected === undefined ? "button" : "checkbox"}
        accessibilityState={selected === undefined ? undefined : { checked: selected }}
        accessibilityLabel={titleText}
        accessibilityHint={onLongPress ? t("tables.kanban.cardHint") : t("tables.openRowHint")}
        style={{ flex: 1, flexDirection: "row", overflow: "hidden", borderRadius: metrics.radius.lg, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.accent : colors.border, backgroundColor: pressed ? colors.border : selected ? `${colors.accent}14` : colors.surface }}
      >
        {bar ? <View testID={`tables-card-${index}-bar`} style={{ width: 4, backgroundColor: bar }} /> : null}
        <View style={{ flex: 1 }}>
          {coverField ? (
            cover ? (
              <Image source={{ uri: cover.url ?? undefined }} fadeDuration={150} resizeMode="cover" style={{ height: COVER_HEIGHT, backgroundColor: colors.border }} accessibilityIgnoresInvertColors />
            ) : (
              <View style={{ height: COVER_HEIGHT, backgroundColor: colors.border }} />
            )
          ) : null}
          <View style={{ padding: CARD_PAD, gap: CARD_GAP }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {selected !== undefined ? (
                <View testID={`${testID ?? `tables-card-${index}`}-check`} style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
                  {selected ? <Check size={14} color={colors.onAccent} /> : null}
                </View>
              ) : null}
              <Text variant="label" numberOfLines={1} style={{ flex: 1, height: CARD_TITLE, fontSize: 16, lineHeight: 22 }}>
                {titleText}
              </Text>
            </View>
            {fields.map((f) => (
              <CardValue key={f.id} field={f} value={row.values[f.id]} known={known} testID={`tables-card-${index}-f${f.id}`} />
            ))}
          </View>
        </View>
      </Pressable>
    </View>
  );
}
