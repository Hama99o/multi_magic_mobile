/**
 * FIELDS, one sheet (SPEC C7; Airtable's "Customize cards"). Increment 3.
 *
 * Which columns the row page and the cards show, which three a card shows
 * under its title, and the colour bar. All of it is the person's (SPEC C1):
 * applied to the personal layer, never to the view.
 */
import { Pressable, Switch, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { FieldDefinition } from "@/api/fields";
import { BottomSheet } from "@/components/BottomSheet";
import { Check } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { CARD_FIELDS } from "./personalView";
import { groupable } from "./filters";

export function FieldsSheet({
  open,
  fields,
  primaryFieldId,
  hidden,
  onCards,
  colorFieldId,
  onChange,
  onClose,
}: {
  open: boolean;
  fields: FieldDefinition[];
  primaryFieldId: number | null;
  hidden: number[];
  /** The fields cards show now, in order. */
  onCards: number[];
  colorFieldId: number | null;
  onChange: (patch: { hiddenFieldIds?: number[]; cardFieldIds?: number[]; rowColorFieldId?: number | null }) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const others = fields.filter((f) => f.id !== primaryFieldId);

  const toggleHidden = (id: number, show: boolean) => {
    const next = show ? hidden.filter((h) => h !== id) : [...hidden, id];
    // A hidden field leaves the cards too.
    onChange(show ? { hiddenFieldIds: next } : { hiddenFieldIds: next, cardFieldIds: onCards.filter((c) => c !== id) });
  };
  const toggleCard = (id: number) => {
    const on = onCards.includes(id);
    if (!on && onCards.length >= CARD_FIELDS) return;
    onChange({ cardFieldIds: on ? onCards.filter((c) => c !== id) : [...onCards, id] });
  };

  return (
    <BottomSheet open={open} title={t("tables.fieldsSheet.title")} subtitle={t("tables.find.personal")} onClose={onClose} testID="tables-fields">
      <View style={{ gap: metrics.space.xs, paddingHorizontal: metrics.space.lg }}>
        <Text tone="muted" variant="caption">
          {t("tables.fieldsSheet.cardHint", { count: CARD_FIELDS })}
        </Text>
        {others.map((f) => {
          const shown = !hidden.includes(f.id);
          const card = onCards.includes(f.id);
          const full = !card && onCards.length >= CARD_FIELDS;
          return (
            <View key={f.id} testID={`tables-fields-${f.id}`} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch }}>
              <Text numberOfLines={1} style={{ flex: 1 }}>
                {f.name}
              </Text>
              <Pressable
                testID={`tables-fields-${f.id}-card`}
                onPress={() => toggleCard(f.id)}
                disabled={!shown || full}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: card, disabled: !shown || full }}
                accessibilityLabel={t("tables.fieldsSheet.onCard", { field: f.name })}
                style={{ minHeight: 32, paddingHorizontal: metrics.space.sm, borderRadius: metrics.radius.pill, flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: card ? colors.accent : colors.border, opacity: !shown || full ? 0.4 : 1 }}
              >
                {card ? <Check size={14} color={colors.accent} /> : null}
                <Text variant="caption">{t("tables.fieldsSheet.card")}</Text>
              </Pressable>
              <Switch testID={`tables-fields-${f.id}-shown`} value={shown} onValueChange={(on) => toggleHidden(f.id, on)} accessibilityLabel={t("tables.fieldsSheet.show", { field: f.name })} trackColor={{ true: colors.accent, false: colors.border }} />
            </View>
          );
        })}

        {groupable(fields).length ? (
          <View style={{ gap: metrics.space.xs, marginTop: metrics.space.md }}>
            <Text variant="label">{t("tables.fieldsSheet.colorBy")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
              {[{ id: null as number | null, name: t("tables.fieldsSheet.noColor") }, ...groupable(fields).map((f) => ({ id: f.id as number | null, name: f.name }))].map((o) => {
                const on = o.id === colorFieldId;
                return (
                  <Pressable key={String(o.id)} testID={`tables-color-${o.id ?? "none"}`} onPress={() => onChange({ rowColorFieldId: o.id })} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.name} style={{ minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center", borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.surface }}>
                    <Text variant="label" tone={on ? "onAccent" : "default"}>
                      {o.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}
