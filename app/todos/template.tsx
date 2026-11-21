/**
 * A template, new or edited (the web's `TemplatesDrawer.tsx` form): a name,
 * one task per line, and an optional repeat (every N days, weeks or months),
 * which makes a fresh list on its own each time it comes round. A modal, like
 * `contacts/edit`.
 */
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useNav, useNavParams } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { todoKeys } from "@/api/keys";
import { TODO_FREQUENCIES, todoTemplatesApi, type TodoFrequency, type TodoTemplate } from "@/api/todos";
import { Minus, Plus, Repeat, X } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { ChoiceSheet } from "@/screens/calendar/ChoiceSheet";
import { useSaveTemplate } from "@/screens/todos/useTodoMutations";
import { linesToItems, repeatLabel } from "@/screens/todos/templates";

export default function TemplateForm() {
  const params = useNavParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : null;
  const templates = useQuery({ queryKey: todoKeys.templates(), queryFn: todoTemplatesApi.list, enabled: id != null });
  const existing = id == null ? null : templates.data?.find((x) => x.id === id);
  if (id != null && !existing) return <Screen measure>{null}</Screen>;
  return <Form key={existing?.id ?? "new"} existing={existing ?? null} />;
}

function Form({ existing }: { existing: TodoTemplate | null }) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [name, setName] = useState(existing?.name ?? "");
  const [items, setItems] = useState((existing?.items ?? []).map((i) => i.title).join("\n"));
  const [frequency, setFrequency] = useState<TodoFrequency>(existing?.frequency ?? "none");
  const [interval, setInterval] = useState(existing?.intervalCount ?? 1);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveTemplate({ onDone: () => router.back(), onError: () => setError(t("todos.failed")) });
  const field = { borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, backgroundColor: colors.surface, fontSize: 16 } as const;
  const repeat = repeatLabel({ frequency, intervalCount: interval }, t);

  return (
    <Screen measure avoidKeyboard>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
        <Pressable testID="todo-template-close" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8} style={{ width: 32, height: 32, justifyContent: "center" }}>
          <X size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          {existing ? t("todos.editTemplate") : t("todos.newTemplate")}
        </Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: metrics.space.lg, paddingBottom: metrics.space.xl }}>
        <View style={{ gap: metrics.space.xs }}>
          <Text variant="label">{t("todos.templateName")}</Text>
          <TextInput testID="todo-template-name" value={name} onChangeText={setName} placeholder={t("todos.templateNamePlaceholder")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("todos.templateName")} style={{ ...field, minHeight: 48 }} />
        </View>
        <View style={{ gap: metrics.space.xs }}>
          <Text variant="label">{t("todos.templateItems")}</Text>
          <TextInput
            testID="todo-template-items"
            value={items}
            onChangeText={setItems}
            multiline
            placeholder={t("todos.templateItemsPlaceholder")}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t("todos.templateItems")}
            style={{ ...field, minHeight: 160, paddingTop: metrics.space.sm, textAlignVertical: "top" }}
          />
          <Text variant="caption" tone="muted">
            {t("todos.templateItemsHint", { count: linesToItems(items).length })}
          </Text>
        </View>
        <View style={{ gap: metrics.space.sm }}>
          <Text variant="label">{t("todos.repeat")}</Text>
          <Pressable testID="todo-template-repeat" onPress={() => setChoosing(true)} accessibilityRole="button" accessibilityLabel={`${t("todos.repeat")}: ${t(`todos.frequency.${frequency}`)}`} style={{ ...field, minHeight: 48, flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
            <Repeat size={18} color={colors.inkMuted} />
            <Text style={{ flex: 1 }}>{t(`todos.frequency.${frequency}`)}</Text>
          </Pressable>
          {frequency !== "none" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md }}>
              <Stepper testID="todo-template-interval-minus" icon={Minus} label={t("todos.intervalLess")} disabled={interval <= 1} onPress={() => setInterval((n) => Math.max(1, n - 1))} />
              <Text testID="todo-template-interval" style={{ flex: 1, textAlign: "center" }}>
                {repeat}
              </Text>
              <Stepper testID="todo-template-interval-plus" icon={Plus} label={t("todos.intervalMore")} disabled={interval >= 99} onPress={() => setInterval((n) => Math.min(99, n + 1))} />
            </View>
          ) : null}
        </View>
        {error ? <Text tone="danger">{error}</Text> : null}
        <Button
          testID="todo-template-save"
          label={t("common.save")}
          busy={save.isPending}
          disabled={!name.trim()}
          onPress={() => save.mutate({ id: existing?.id ?? null, input: { name: name.trim(), items: linesToItems(items), frequency, intervalCount: frequency === "none" ? 1 : interval } })}
        />
      </ScrollView>
      <ChoiceSheet
        open={choosing}
        title={t("todos.repeat")}
        testID="todo-template-frequency"
        value={frequency}
        choices={TODO_FREQUENCIES.map((f) => ({ value: f, label: t(`todos.frequency.${f}`) }))}
        onPick={setFrequency}
        onClose={() => setChoosing(false)}
      />
    </Screen>
  );
}

function Stepper({ icon: Icon, label, onPress, disabled, testID }: { icon: typeof Plus; label: string; onPress: () => void; disabled: boolean; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} style={{ width: metrics.touch, height: metrics.touch, borderRadius: metrics.touch / 2, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}>
      <Icon size={18} color={colors.ink} />
    </Pressable>
  );
}
