/**
 * Making and changing an event — one form for every kind (SPEC §C.4).
 *
 * Layout from the references (SPEC §B): Cancel · title · Save in the header
 * (Apple Invites, Saturn), grouped rounded sections on the ground (Saturn),
 * `Starts [date][time]` / `Ends [date][time]` rows whose pickers open inline
 * (Apple Invites, WhatsApp), "Repeats weekly until …" spelled out (Outlook),
 * Remind me as chips (the web's presets).
 *
 * The rules live in `draft.ts` and are tested there; this file only lays them
 * out. Errors appear after the first Save, never while a person is still
 * typing the title they were about to type.
 */
import { useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Keyboard, Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Bell, ChevronRight, MapPin, Repeat as RepeatIcon } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { KINDS, RECURRENCES, REMINDER_PRESETS, type EventKind, type Recurrence } from "@/api/calendar";
import { WhenRow, type OpenPicker } from "./pickers";
import { ChoiceSheet } from "./ChoiceSheet";
import { COLOR_CHOICES, EVENT_COLORS } from "./colors";
import { formatDay } from "./dates";
import {
  problems,
  toggleReminder,
  withAllDay,
  withDay,
  withKind,
  withStartTime,
  type Draft,
  type Problem,
} from "./draft";

function Section({ children }: { children: ReactNode }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: metrics.radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: metrics.space.md,
        paddingVertical: metrics.space.xs,
        marginBottom: metrics.space.md,
      }}
    >
      {children}
    </View>
  );
}

/** `radio` for a single choice (the kind), `checkbox` for several (the
 *  reminders): the role is what a screen reader says the chip IS. */
function Chip({ label, selected, onPress, testID, role = "checkbox" }: { label: string; selected: boolean; onPress: () => void; testID: string; role?: "radio" | "checkbox" }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      hitSlop={4}
      style={{
        minHeight: 40,
        paddingHorizontal: metrics.space.md,
        justifyContent: "center",
        borderRadius: metrics.radius.pill,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accent : "transparent",
      }}
    >
      <Text variant="label" tone={selected ? "onAccent" : "default"}>
        {label}
      </Text>
    </Pressable>
  );
}

export function EventForm({
  mode,
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
  saveError,
  series = false,
}: {
  mode: "create" | "edit";
  /** Editing a repeating event changes EVERY occurrence (as on the web). */
  series?: boolean;
  draft: Draft;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  saveError: string | null;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState<OpenPicker>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [tried, setTried] = useState(false);
  const notesRef = useRef<TextInput>(null);
  const found: Problem[] = tried ? problems(draft) : [];

  const openPicker = (which: OpenPicker) => {
    Keyboard.dismiss();
    setOpen(which);
  };

  const save = () => {
    setTried(true);
    setOpen(null);
    if (problems(draft).length === 0) onSave();
  };

  const field = {
    color: colors.ink,
    fontSize: 16,
    minHeight: metrics.touch,
    paddingVertical: metrics.space.sm,
  } as const;

  const recurrenceSummary =
    draft.recurrence === "none"
      ? t("calendar.recurrence.none")
      : draft.recurrenceUntil
        ? t("calendar.repeatsUntil", { rule: t(`calendar.recurrence.${draft.recurrence}`), date: formatDay(draft.recurrenceUntil, i18n.language, true) })
        : t(`calendar.recurrence.${draft.recurrence}`);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: metrics.space.sm, gap: metrics.space.sm }}>
        <Pressable testID="event-form-cancel" onPress={onCancel} accessibilityRole="button" accessibilityLabel={t("common.cancel")} hitSlop={8} style={{ minHeight: metrics.touch, justifyContent: "center" }}>
          <Text tone="accent">{t("common.cancel")}</Text>
        </Pressable>
        <Text variant="label" accessibilityRole="header" style={{ flex: 1, textAlign: "center" }} numberOfLines={1}>
          {mode === "create" ? t("calendar.form.newTitle") : t("calendar.form.editTitle")}
        </Text>
        <Pressable
          testID="event-form-save"
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={t("common.save")}
          accessibilityState={{ disabled: saving, busy: saving }}
          hitSlop={8}
          style={{ minHeight: 36, minWidth: 72, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text variant="label" tone="onAccent">{t("common.save")}</Text>}
        </Pressable>
      </View>

      {/* Under the header, OUTSIDE the scroll view: next to the Save that was
          just tapped. At the bottom of the form (where it was) a failed
          save looked like a Save that did nothing (device, 2026-11-11). */}
      {saveError ? (
        <Text testID="event-form-error" tone="danger" accessibilityLiveRegion="assertive" style={{ paddingBottom: metrics.space.sm }}>
          {`${t("calendar.form.notSaved")} ${saveError}`}
        </Text>
      ) : null}

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: metrics.space.xl * 2 }} testID="event-form">
        {series ? (
          <Text testID="event-form-series-note" variant="caption" tone="muted" style={{ paddingBottom: metrics.space.sm }}>
            {t("calendar.form.seriesNote")}
          </Text>
        ) : null}
        <Section>
          <TextInput
            testID="event-form-title"
            value={draft.title}
            onChangeText={(title) => onChange({ ...draft, title })}
            placeholder={t("calendar.form.titlePlaceholder")}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t("calendar.form.titleLabel")}
            autoFocus={mode === "create"}
            maxLength={200}
            returnKeyType="next"
            onFocus={() => setOpen(null)}
            style={{ ...field, fontSize: 20, fontWeight: "600" }}
          />
          {found.includes("title") ? (
            <Text testID="event-form-title-error" tone="danger" variant="caption" accessibilityLiveRegion="polite" style={{ paddingBottom: metrics.space.sm }}>
              {t("calendar.form.titleRequired")}
            </Text>
          ) : null}
        </Section>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm, marginBottom: metrics.space.md }} accessibilityRole="radiogroup" accessibilityLabel={t("calendar.form.kindLabel")}>
          {KINDS.map((kind: EventKind) => (
            <Chip key={kind} role="radio" testID={`event-form-kind-${kind}`} label={t(`calendar.kind.${kind}`)} selected={draft.kind === kind} onPress={() => onChange(withKind(draft, kind))} />
          ))}
        </View>

        <Section>
          <View style={{ flexDirection: "row", alignItems: "center", minHeight: metrics.touch }}>
            <Text style={{ flex: 1 }}>{t("calendar.allDay")}</Text>
            <Switch
              testID="event-form-all-day"
              value={draft.allDay}
              onValueChange={(value) => {
                setOpen(null);
                onChange(withAllDay(draft, value));
              }}
              accessibilityLabel={t("calendar.allDay")}
              trackColor={{ true: colors.accent, false: colors.border }}
            />
          </View>
          <WhenRow
            name="start"
            label={t("calendar.form.starts")}
            day={draft.day}
            onDay={(day) => onChange(withDay(draft, day))}
            time={draft.allDay ? undefined : draft.startTime}
            onTime={draft.allDay ? undefined : (time) => onChange(withStartTime(draft, time))}
            open={open}
            onOpen={openPicker}
            withYear={draft.kind === "birthday" || draft.kind === "anniversary"}
          />
          <WhenRow
            name="end"
            label={t("calendar.form.ends")}
            day={draft.endDay}
            emptyLabel={draft.allDay ? t("calendar.form.sameDay") : formatDay(draft.day, i18n.language)}
            onDay={(endDay) => onChange({ ...draft, endDay })}
            onClear={() => onChange({ ...draft, endDay: "" })}
            time={draft.allDay ? undefined : draft.endTime}
            onTime={draft.allDay ? undefined : (endTime) => onChange({ ...draft, endTime })}
            open={open}
            onOpen={openPicker}
            minDay={draft.day}
          />
          {found.includes("end") ? (
            <Text testID="event-form-end-error" tone="danger" variant="caption" accessibilityLiveRegion="polite">
              {t("calendar.form.endBeforeStart")}
            </Text>
          ) : null}
          {found.includes("day") ? (
            <Text tone="danger" variant="caption" accessibilityLiveRegion="polite">
              {t("calendar.form.dayRequired")}
            </Text>
          ) : null}
        </Section>

        <Section>
          <Pressable
            testID="event-form-repeat"
            onPress={() => {
              Keyboard.dismiss();
              setOpen(null);
              setRepeatOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${t("calendar.form.repeat")}, ${recurrenceSummary}`}
            style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: metrics.touch }}
          >
            <RepeatIcon size={18} color={colors.inkMuted} />
            <Text style={{ flex: 1 }}>{t("calendar.form.repeat")}</Text>
            <Text tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {t(`calendar.recurrence.${draft.recurrence}`)}
            </Text>
            <ChevronRight size={18} color={colors.inkMuted} />
          </Pressable>
          {draft.recurrence !== "none" ? (
            <WhenRow
              name="until"
              label={t("calendar.form.until")}
              day={draft.recurrenceUntil}
              emptyLabel={t("calendar.form.forever")}
              onDay={(recurrenceUntil) => onChange({ ...draft, recurrenceUntil })}
              onClear={() => onChange({ ...draft, recurrenceUntil: "" })}
              open={open}
              onOpen={openPicker}
              minDay={draft.day}
              withYear
            />
          ) : null}
          {found.includes("until") ? (
            <Text tone="danger" variant="caption" accessibilityLiveRegion="polite">
              {t("calendar.form.untilBeforeStart")}
            </Text>
          ) : null}
        </Section>

        <Section>
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md }}>
            <MapPin size={18} color={colors.inkMuted} />
            <TextInput
              testID="event-form-location"
              value={draft.location}
              onChangeText={(location) => onChange({ ...draft, location })}
              placeholder={t("calendar.form.locationPlaceholder")}
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel={t("calendar.form.locationLabel")}
              maxLength={200}
              returnKeyType="next"
              onFocus={() => setOpen(null)}
              onSubmitEditing={() => notesRef.current?.focus()}
              style={{ ...field, flex: 1 }}
            />
          </View>
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <TextInput
            ref={notesRef}
            testID="event-form-notes"
            value={draft.description}
            onChangeText={(description) => onChange({ ...draft, description })}
            placeholder={t("calendar.form.notesPlaceholder")}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t("calendar.form.notesLabel")}
            multiline
            onFocus={() => setOpen(null)}
            style={{ ...field, minHeight: 88, textAlignVertical: "top" }}
          />
        </Section>

        <Section>
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: metrics.touch }}>
            <Bell size={18} color={colors.inkMuted} />
            <Text style={{ flex: 1 }}>{t("calendar.form.remindMe")}</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm, paddingBottom: metrics.space.sm }}>
            {REMINDER_PRESETS.map((minutes) => (
              <Chip key={minutes} testID={`event-form-remind-${minutes}`} label={t(`calendar.lead.${minutes}`)} selected={draft.reminders.includes(minutes)} onPress={() => onChange(toggleReminder(draft, minutes))} />
            ))}
          </View>
          <Text variant="caption" tone="muted" style={{ paddingBottom: metrics.space.sm }}>
            {t("calendar.form.reminderHow")}
          </Text>
        </Section>

        <Section>
          <Text style={{ paddingTop: metrics.space.sm }}>{t("calendar.form.colorLabel")}</Text>
          <View style={{ flexDirection: "row", gap: metrics.space.md, paddingVertical: metrics.space.sm }} accessibilityRole="radiogroup">
            {COLOR_CHOICES.map((color) => {
              const selected = draft.color === color;
              return (
                <Pressable
                  key={color}
                  testID={`event-form-color-${color}`}
                  onPress={() => onChange({ ...draft, color })}
                  accessibilityRole="radio"
                  accessibilityLabel={t(`calendar.color.${color}`)}
                  accessibilityState={{ checked: selected }}
                  style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
                >
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: EVENT_COLORS[color], borderWidth: selected ? 3 : 0, borderColor: colors.ink }} />
                </Pressable>
              );
            })}
          </View>
        </Section>

      </ScrollView>

      <ChoiceSheet<Recurrence>
        open={repeatOpen}
        title={t("calendar.form.repeat")}
        testID="event-form-repeat-sheet"
        value={draft.recurrence}
        choices={RECURRENCES.map((rule) => ({ value: rule, label: t(`calendar.recurrence.${rule}`) }))}
        onPick={(recurrence) => onChange({ ...draft, recurrence })}
        onClose={() => setRepeatOpen(false)}
      />
    </View>
  );
}
