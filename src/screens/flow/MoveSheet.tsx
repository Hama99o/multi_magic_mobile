/**
 * "Move to…" — the phone's answer to dragging a card ACROSS columns (parity
 * audit, "Phone-hard items"): a drag between pages of a pager is fragile, so
 * the column, the place in it (top or bottom) and, for an editor, the sprint
 * are picked here. It goes through `move`, which records the history the web's
 * drag does not.
 */
import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Card, Column, Sprint } from "@/api/flow";
import { BottomSheet } from "@/components/BottomSheet";
import { ChoiceRow, SheetButton } from "@/components/fields/FieldRow";
import { Text } from "@/components/reusables/text";
import { useMetrics } from "@/hooks/useColors";
import { colorHex } from "./logic";
import { Segmented } from "./parts";

export interface MoveTarget {
  columnId: number;
  where: "top" | "bottom";
  sprintId: number | null;
}

export function MoveSheet({ card, columns, sprints, onMove, onClose }: { card: Card; columns: Column[]; sprints: Sprint[]; onMove: (to: MoveTarget) => void; onClose: () => void }) {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [columnId, setColumnId] = useState(card.columnId);
  const [where, setWhere] = useState<"top" | "bottom">("top");
  const [sprintId, setSprintId] = useState<number | null>(card.sprintId);
  const same = columnId === card.columnId && sprintId === card.sprintId;

  return (
    <BottomSheet
      open
      title={t("flow.move.title")}
      subtitle={card.title}
      onClose={onClose}
      testID="flow-move"
      footer={
        <SheetButton
          testID="flow-move-confirm"
          label={same ? t("flow.move.reorder", { where: t(`flow.move.${where}`) }) : t("flow.move.confirm")}
          onPress={() => {
            onMove({ columnId, where, sprintId });
            onClose();
          }}
        />
      }
    >
      <Text variant="label" tone="muted" accessibilityRole="header" style={{ marginBottom: metrics.space.xs }}>
        {t("flow.move.column")}
      </Text>
      {columns.map((c) => (
        <ChoiceRow key={c.id} testID={`flow-move-column-${c.position}`} label={c.title} color={colorHex(c.color)} selected={c.id === columnId} multi={false} onPress={() => setColumnId(c.id)} />
      ))}
      <View style={{ marginVertical: metrics.space.md }}>
        <Segmented
          testID="flow-move-where"
          value={where}
          onChange={setWhere}
          options={[
            { value: "top", label: t("flow.move.top") },
            { value: "bottom", label: t("flow.move.bottom") },
          ]}
        />
      </View>
      {sprints.length ? (
        <>
          <Text variant="label" tone="muted" accessibilityRole="header" style={{ marginBottom: metrics.space.xs }}>
            {t("flow.move.sprint")}
          </Text>
          <ChoiceRow testID="flow-move-sprint-none" label={t("flow.sprints.noSprint")} selected={sprintId == null} multi={false} onPress={() => setSprintId(null)} />
          {sprints
            .filter((s) => s.status !== "completed" || s.id === card.sprintId)
            .map((s) => (
              <ChoiceRow key={s.id} testID="flow-move-sprint" label={s.title} selected={s.id === sprintId} multi={false} onPress={() => setSprintId(s.id)} />
            ))}
        </>
      ) : null}
    </BottomSheet>
  );
}
