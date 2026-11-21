/**
 * Sprints — the web's `SprintManagerDrawer.tsx`, and the board's sprint
 * switcher in one sheet.
 *
 * The top rows choose what the board shows: every card (a paged server only),
 * the cards with no sprint, or one sprint. An owner or admin also creates a
 * sprint (title, goal, dates; the server refuses an end before the start and
 * its sentence is shown), activates it (any other active one goes back to
 * planning), completes it, edits it, and deletes it after a confirm that says
 * its cards go back to the backlog (`sprint.rb` `dependent: :nullify`; the
 * web deletes on one click).
 */
import { useRef, useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Sprint, SprintScope, SprintStatus } from "@/api/flow";
import { failureMessage } from "@/api/failure";
import { BottomSheet } from "@/components/BottomSheet";
import { SheetButton } from "@/components/fields/FieldRow";
import { Calendar, Check, CircleCheck, Pencil, Play, Trash2, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import type { Tokens } from "@/theme/tokens";
import { MonthGrid } from "@/screens/calendar/MonthGrid";
import { formatDay, startOfMonth, todayKey } from "@/screens/calendar/dates";
import { Pill } from "./parts";
import { useDeleteSprint, useSaveSprint, useSprintStatus } from "./useFlowMutations";

/**
 * A status pill's colour, from the theme (src/theme/tokens.ts). Planning is
 * `ink`, not `inkMuted`: the pill's words sit on a tint of their own colour,
 * and muted ink on its tint is under 4.5:1 in light mode
 * (`__tests__/sprintStatus.test.ts`).
 */
export function sprintStatusColor(colors: Tokens, status: SprintStatus): string {
  return status === "active" ? colors.success : status === "completed" ? colors.info : colors.ink;
}

export function sprintLabel(scope: SprintScope, sprints: Sprint[], t: (k: string) => string): string {
  if (scope === "all") return t("flow.sprints.all");
  if (scope === "backlog") return t("flow.sprints.noSprint");
  return sprints.find((s) => s.id === scope)?.title ?? t("flow.sprints.title");
}

export function SprintsSheet({
  projectId,
  sprints,
  scope,
  canAll,
  manage,
  onScope,
  onClose,
}: {
  projectId: number;
  sprints: Sprint[];
  scope: SprintScope;
  /** The server pages, so it understands "all". */
  canAll: boolean;
  manage: boolean;
  onScope: (scope: SprintScope) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState<Sprint | "new" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const fail = (e: unknown) => setFailure(failureMessage(e, t("flow.sprints.failed")));
  const status = useSprintStatus(projectId, { onError: fail });
  const remove = useDeleteSprint(projectId, { onDone: (id) => scope === id && onScope("backlog"), onError: fail });

  const pick = (s: SprintScope) => {
    onScope(s);
    onClose();
  };

  const confirmDelete = (s: Sprint) =>
    Alert.alert(t("flow.sprints.deleteTitle", { title: s.title }), t("flow.sprints.deleteBody"), [
      { text: t("fields.cancel"), style: "cancel" },
      { text: t("flow.delete"), style: "destructive", onPress: () => remove.mutate(s.id) },
    ]);

  if (editing) return <SprintForm projectId={projectId} sprint={editing === "new" ? null : editing} onClose={() => setEditing(null)} />;

  const scopes: { value: SprintScope; label: string }[] = [...(canAll ? [{ value: "all" as const, label: t("flow.sprints.all") }] : []), { value: "backlog", label: t("flow.sprints.noSprint") }];

  return (
    <BottomSheet
      open
      title={t("flow.sprints.title")}
      onClose={onClose}
      testID="flow-sprints"
      footer={manage ? <SheetButton testID="flow-sprint-new" label={t("flow.sprints.new")} onPress={() => setEditing("new")} /> : undefined}
    >
      {failure ? (
        <Text testID="flow-sprints-failure" tone="danger" accessibilityLiveRegion="polite" style={{ marginBottom: metrics.space.sm }}>
          {failure}
        </Text>
      ) : null}
      {scopes.map((s) => (
        <ScopeRow key={String(s.value)} testID={`flow-scope-${s.value}`} label={s.label} selected={scope === s.value} onPress={() => pick(s.value)} />
      ))}
      <Text variant="label" tone="muted" accessibilityRole="header" style={{ marginTop: metrics.space.md, marginBottom: metrics.space.xs }}>
        {t("flow.sprints.list")}
      </Text>
      {sprints.length === 0 ? (
        <Text tone="muted" testID="flow-sprints-empty" style={{ paddingVertical: metrics.space.sm }}>
          {t("flow.sprints.none")}
        </Text>
      ) : null}
      {sprints.map((s) => (
        <View key={s.id} testID="flow-sprint" style={{ paddingVertical: metrics.space.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: metrics.space.xs }}>
          <Pressable onPress={() => pick(s.id)} accessibilityRole="radio" accessibilityState={{ checked: scope === s.id }} accessibilityLabel={[s.title, t(`flow.sprints.status.${s.status}`), s.goal].filter(Boolean).join(". ")} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 44 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
                <Text numberOfLines={1} style={{ fontWeight: "600", flexShrink: 1 }}>
                  {s.title}
                </Text>
                <Pill label={t(`flow.sprints.status.${s.status}`)} color={sprintStatusColor(colors, s.status)} />
              </View>
              {s.goal ? (
                <Text variant="caption" tone="muted" numberOfLines={2}>
                  {s.goal}
                </Text>
              ) : null}
              {s.startDate || s.endDate ? (
                <Text variant="caption" tone="muted">
                  {[s.startDate ? formatDay(s.startDate, i18n.language, true) : "…", s.endDate ? formatDay(s.endDate, i18n.language, true) : "…"].join(" – ")}
                </Text>
              ) : null}
            </View>
            {scope === s.id ? <Check size={20} color={colors.accent} /> : null}
          </Pressable>
          {manage ? (
            <View style={{ flexDirection: "row", gap: metrics.space.xs, flexWrap: "wrap" }}>
              {s.status === "planning" ? <SmallAction testID="flow-sprint-activate" icon={Play} label={t("flow.sprints.activate")} onPress={() => status.mutate({ sprintId: s.id, to: "active" })} /> : null}
              {s.status === "active" ? <SmallAction testID="flow-sprint-complete" icon={CircleCheck} label={t("flow.sprints.complete")} onPress={() => status.mutate({ sprintId: s.id, to: "completed" })} /> : null}
              <SmallAction testID="flow-sprint-edit" icon={Pencil} label={t("flow.sprints.edit")} onPress={() => setEditing(s)} />
              <SmallAction testID="flow-sprint-delete" icon={Trash2} label={t("flow.delete")} danger onPress={() => confirmDelete(s)} />
            </View>
          ) : null}
        </View>
      ))}
    </BottomSheet>
  );
}

function ScopeRow({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", minHeight: metrics.touch, gap: metrics.space.md }}>
      <Text style={{ flex: 1, fontWeight: selected ? "700" : "400" }}>{label}</Text>
      {selected ? <Check size={20} color={colors.accent} /> : null}
    </Pressable>
  );
}

function SmallAction({ label, icon: Icon, onPress, danger = false, testID }: { label: string; icon: typeof Play; onPress: () => void; danger?: boolean; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: danger ? `${colors.danger}66` : colors.border }}>
      <Icon size={15} color={danger ? colors.danger : colors.ink} />
      <Text variant="caption" tone={danger ? "danger" : "default"} style={{ fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SprintForm({ projectId, sprint, onClose }: { projectId: number; sprint: Sprint | null; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const firstInput = useRef<TextInput>(null);
  const today = todayKey();
  const [title, setTitle] = useState(sprint?.title ?? "");
  const [goal, setGoal] = useState(sprint?.goal ?? "");
  const [start, setStart] = useState<string | null>(sprint?.startDate ?? null);
  const [end, setEnd] = useState<string | null>(sprint?.endDate ?? null);
  const [picking, setPicking] = useState<"start" | "end" | null>(null);
  const [month, setMonth] = useState(startOfMonth(today));
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const save = useSaveSprint(projectId, { onDone: onClose, onError: (e) => setFailure(failureMessage(e, t("flow.sprints.failed"))) });
  const badOrder = Boolean(start && end && end < start);

  const submit = () => {
    setTried(true);
    if (!title.trim() || badOrder) return;
    save.mutate({ sprintId: sprint?.id ?? null, input: { title: title.trim(), goal: goal.trim() || null, startDate: start, endDate: end } });
  };

  const input = { borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface } as const;

  const dateButton = (which: "start" | "end", value: string | null) => (
    <View style={{ flex: 1, gap: metrics.space.xs }}>
      <Text variant="label">{which === "start" ? t("flow.sprints.start") : t("flow.sprints.end")}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Pressable
          testID={`flow-sprint-${which}`}
          onPress={() => {
            setPicking(picking === which ? null : which);
            setMonth(startOfMonth(value ?? start ?? today));
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: picking === which }}
          accessibilityLabel={`${which === "start" ? t("flow.sprints.start") : t("flow.sprints.end")}: ${value ? formatDay(value, i18n.language, true) : t("fields.empty")}`}
          style={{ ...input, flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 6, borderColor: picking === which ? colors.accent : colors.border }}
        >
          <Calendar size={16} color={colors.inkMuted} />
          <Text numberOfLines={1} tone={value ? "default" : "muted"}>
            {value ? formatDay(value, i18n.language, true) : t("fields.empty")}
          </Text>
        </Pressable>
        {value ? (
          <Pressable onPress={() => (which === "start" ? setStart(null) : setEnd(null))} accessibilityRole="button" accessibilityLabel={t("fields.clear")} hitSlop={6} style={{ width: 32, height: 44, alignItems: "center", justifyContent: "center" }}>
            <X size={16} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <BottomSheet focusRef={sprint ? undefined : firstInput}
      open
      title={sprint ? t("flow.sprints.edit") : t("flow.sprints.new")}
      onClose={onClose}
      testID="flow-sprint-form"
      footer={<SheetButton testID="flow-sprint-save" label={sprint ? t("fields.save") : t("flow.sprints.create")} busy={save.isPending} onPress={submit} />}
    >
      <View style={{ gap: metrics.space.md }}>
        <View style={{ gap: metrics.space.xs }}>
          <Text variant="label">{t("flow.sprints.name")}</Text>
          <TextInput testID="flow-sprint-title" value={title} onChangeText={setTitle} ref={firstInput} placeholder={t("flow.sprints.namePlaceholder")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("flow.sprints.name")} style={{ ...input, minHeight: 48, borderColor: tried && !title.trim() ? colors.danger : colors.border }} />
          {tried && !title.trim() ? (
            <Text tone="danger" variant="caption" accessibilityLiveRegion="polite">
              {t("flow.sprints.nameRequired")}
            </Text>
          ) : null}
        </View>
        <View style={{ gap: metrics.space.xs }}>
          <Text variant="label">{t("flow.sprints.goal")}</Text>
          <TextInput testID="flow-sprint-goal" value={goal} onChangeText={setGoal} multiline placeholder={t("flow.sprints.goalPlaceholder")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("flow.sprints.goal")} style={{ ...input, minHeight: 72, paddingVertical: metrics.space.sm, textAlignVertical: "top" }} />
        </View>
        <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
          {dateButton("start", start)}
          {dateButton("end", end)}
        </View>
        {picking ? (
          <MonthGrid
            testID="flow-sprint-month"
            month={month}
            selected={picking === "start" ? start : end}
            today={today}
            minDay={picking === "end" && start ? start : undefined}
            onMonthChange={setMonth}
            onSelect={(day) => {
              if (picking === "start") setStart(day);
              else setEnd(day);
              setPicking(null);
            }}
          />
        ) : null}
        {badOrder ? (
          <Text tone="danger" variant="caption" accessibilityLiveRegion="polite" testID="flow-sprint-order">
            {t("flow.sprints.endBeforeStart")}
          </Text>
        ) : null}
        {failure ? (
          <Text tone="danger" accessibilityLiveRegion="polite" testID="flow-sprint-failure">
            {failure}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

