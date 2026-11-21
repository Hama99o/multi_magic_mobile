/**
 * A field's value on a CARD: one line, fixed height (Tables SPEC C2, C9).
 *
 * `FieldRow` is the property row of a record page; a card in a recycled list
 * needs something else: never taller than one line, never animated, never
 * measured twice. So every type draws into the same `CARD_VALUE_HEIGHT`:
 * selects as coloured chips, links as chips with the linked row's title, files
 * as one thumbnail and "+N", a boolean as ✓, the rest as one truncated line.
 * The image is the only thing that loads, and it only fades in (the owner's
 * rule for recycled cells: a plain opacity fade at most).
 */
import { Image, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { FieldDefinition, FieldValue } from "@/api/fields";
import { Check } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { colorHex } from "@/screens/flow/logic";
import { displayValue, isEmpty, linkedRecords, optionsFor, type KnownRecords } from "./display";

export const CARD_LABEL_HEIGHT = 16;
export const CARD_VALUE_HEIGHT = 24;
const THUMB = 24;
const MAX_CHIPS = 3;

const isImage = (contentType: string | null) => Boolean(contentType?.startsWith("image/"));

export function CardValue({ field, value, known, testID }: { field: FieldDefinition; value: FieldValue | undefined; known: KnownRecords; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();

  const body = (() => {
    if (field.fieldType === "boolean") {
      return value?.kind === "scalar" && value.value === true ? <Check size={18} color={colors.accent} accessibilityLabel={t("fields.yes")} /> : <Text tone="muted">—</Text>;
    }
    if (isEmpty(value)) return <Text tone="muted">—</Text>;
    if (field.fieldType === "single_select" || field.fieldType === "multi_select") {
      return <Chips labels={optionsFor(field, value).map((o) => ({ label: o.label, color: colorHex(o.color) }))} />;
    }
    if (field.fieldType === "single_record" || field.fieldType === "multi_record") {
      return <Chips labels={linkedRecords(field, value, known).map((o) => ({ label: o.label, color: null }))} />;
    }
    if (value?.kind === "files") {
      const first = value.files[0];
      const more = value.files.length - 1;
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
          {first && isImage(first.contentType) && first.url ? (
            <Image source={{ uri: first.url }} fadeDuration={150} style={{ width: THUMB, height: THUMB, borderRadius: 4, backgroundColor: colors.border }} accessibilityIgnoresInvertColors />
          ) : (
            <Text numberOfLines={1} style={{ maxWidth: 160 }}>
              {first?.filename}
            </Text>
          )}
          {more > 0 ? (
            <Text tone="muted" variant="caption">
              {t("fields.more", { count: more })}
            </Text>
          ) : null}
        </View>
      );
    }
    return <Text numberOfLines={1}>{displayValue(field, value, known, i18n.language) ?? "—"}</Text>;
  })();

  return (
    <View testID={testID}>
      <Text tone="muted" variant="caption" numberOfLines={1} style={{ height: CARD_LABEL_HEIGHT }}>
        {field.name}
      </Text>
      <View style={{ height: CARD_VALUE_HEIGHT, justifyContent: "center", overflow: "hidden" }}>{body}</View>
    </View>
  );
}

function Chips({ labels }: { labels: { label: string; color: string | null }[] }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const shown = labels.slice(0, MAX_CHIPS);
  const more = labels.length - shown.length;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs, overflow: "hidden" }}>
      {shown.map((c, i) => {
        const hex = c.color ?? colors.inkMuted;
        return (
          <View key={`${c.label}-${i}`} style={{ maxWidth: 140, height: 22, paddingHorizontal: 8, borderRadius: 11, justifyContent: "center", backgroundColor: `${hex}26`, borderWidth: 1, borderColor: `${hex}66` }}>
            <Text variant="caption" numberOfLines={1}>
              {c.label}
            </Text>
          </View>
        );
      })}
      {more > 0 ? (
        <Text tone="muted" variant="caption">
          {t("fields.more", { count: more })}
        </Text>
      ) : null}
    </View>
  );
}
