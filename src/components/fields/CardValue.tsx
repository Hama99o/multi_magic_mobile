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
import { Image, useWindowDimensions, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { FieldDefinition, FieldValue } from "@/api/fields";
import { Check } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { colorHex } from "@/screens/flow/logic";
import { displayValue, isEmpty, linkedRecords, optionsFor, type KnownRecords } from "./display";

/**
 * FONT SCALE (hidden-criteria sweep, 2026-11-21). A card's height is fixed, so
 * its boxes grow with the person's font size, up to `FONT_CAP` (200 %,
 * Android's largest setting), and every Text in them stops at the same cap
 * (`maxFontSizeMultiplier`). Then the fixed height is still exact and
 * nothing is clipped: `fontScale.test.tsx` checks each Text against its box.
 */
export const FONT_CAP = 2;
export const capScale = (fontScale: number) => Math.min(Math.max(fontScale || 1, 1), FONT_CAP);
/** The label line: the caption's line height (17), scaled. It was 16, a pixel short even at 100 %. */
export const cardLabelHeight = (fontScale = 1) => Math.ceil(17 * capScale(fontScale));
export const cardValueHeight = (fontScale = 1) => Math.ceil(24 * capScale(fontScale));
const chipHeight = (fontScale: number) => Math.ceil(22 * capScale(fontScale));
const THUMB = 24;
const MAX_CHIPS = 3;

const isImage = (contentType: string | null) => Boolean(contentType?.startsWith("image/"));

export function CardValue({
  field,
  value,
  known,
  testID,
  bare = false,
}: {
  field: FieldDefinition;
  value: FieldValue | undefined;
  known: KnownRecords;
  testID: string;
  /** The value alone, without the column's name above it: a grid cell, under a header that names it. */
  bare?: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const { fontScale } = useWindowDimensions();

  const body = (() => {
    if (field.fieldType === "boolean") {
      return value?.kind === "scalar" && value.value === true ? <Check size={18} color={colors.accent} accessibilityLabel={t("fields.yes")} /> : <Text tone="muted" maxFontSizeMultiplier={FONT_CAP}>—</Text>;
    }
    if (isEmpty(value)) return <Text tone="muted" maxFontSizeMultiplier={FONT_CAP}>—</Text>;
    if (field.fieldType === "single_select" || field.fieldType === "multi_select") {
      return <Chips height={chipHeight(fontScale)} labels={optionsFor(field, value).map((o) => ({ label: o.label, color: colorHex(o.color) }))} />;
    }
    if (field.fieldType === "single_record" || field.fieldType === "multi_record") {
      return <Chips height={chipHeight(fontScale)} labels={linkedRecords(field, value, known).map((o) => ({ label: o.label, color: null }))} />;
    }
    if (value?.kind === "files") {
      const first = value.files[0];
      const more = value.files.length - 1;
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
          {first && isImage(first.contentType) && first.url ? (
            <Image source={{ uri: first.url }} fadeDuration={150} style={{ width: THUMB, height: THUMB, borderRadius: 4, backgroundColor: colors.border }} accessibilityIgnoresInvertColors />
          ) : (
            <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={{ maxWidth: 160 }}>
              {first?.filename}
            </Text>
          )}
          {more > 0 ? (
            <Text tone="muted" variant="caption" maxFontSizeMultiplier={FONT_CAP}>
              {t("fields.more", { count: more })}
            </Text>
          ) : null}
        </View>
      );
    }
    return (
      <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP}>
        {displayValue(field, value, known, i18n.language) ?? "—"}
      </Text>
    );
  })();

  return (
    <View testID={testID}>
      {bare ? null : (
        <Text tone="muted" variant="caption" numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={{ height: cardLabelHeight(fontScale) }}>
          {field.name}
        </Text>
      )}
      <View style={{ height: cardValueHeight(fontScale), justifyContent: "center", overflow: "hidden" }}>{body}</View>
    </View>
  );
}

function Chips({ labels, height }: { labels: { label: string; color: string | null }[]; height: number }) {
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
          <View key={`${c.label}-${i}`} style={{ maxWidth: 140, height, paddingHorizontal: 8, borderRadius: height / 2, justifyContent: "center", backgroundColor: `${hex}26`, borderWidth: 1, borderColor: `${hex}66` }}>
            <Text variant="caption" numberOfLines={1} maxFontSizeMultiplier={FONT_CAP}>
              {c.label}
            </Text>
          </View>
        );
      })}
      {more > 0 ? (
        <Text tone="muted" variant="caption" maxFontSizeMultiplier={FONT_CAP}>
          {t("fields.more", { count: more })}
        </Text>
      ) : null}
    </View>
  );
}
