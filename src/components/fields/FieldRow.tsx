/**
 * ONE CUSTOM FIELD, SHOWN AND EDITED: the phone's `DynamicField` (web
 * `components/core/DynamicField.tsx`), for every type the server has.
 * Flow's card uses it now and Tables' record will, so it names no app: the
 * record, its caches and the labels it can show come in as props
 * (`FieldTarget` via `writes`, `known`).
 *
 * A row is ClickUp's property row (Mobbin `84eb5561`, SPEC §F): the field's
 * icon and name, then its value; a tap opens the type's own editor.
 *
 *   text, long_text, phone, email, url, integer, decimal → a text sheet with
 *     the right keyboard, checked before it is sent (min/max, format);
 *     phone, email and url also offer to call, write or open;
 *   rich_text → the Notes editor (`app/rich-text.tsx`), never tags in a box;
 *   boolean → a switch in the row;
 *   date, datetime → the month grid (and the time wheel), as the Calendar;
 *   single_select, multi_select → the options with their colours;
 *   single_record, multi_record → a searchable picker paged by the server;
 *     a labels field that allows it can create a label from the search;
 *   attachment(s) → the files listed in the row; add from photos or files;
 *   created_time, last_modified_time, lookup, rollup → read only.
 */
import { createElement, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Linking, Pressable, Switch, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fieldKeys } from "@/api/keys";
import { fieldsApi, isReadOnlyType, type FieldDefinition, type FieldFile, type FieldType, type FieldValue, type RecordOption, type SelectOption } from "@/api/fields";
import { failureMessage } from "@/api/failure";
import { BottomSheet } from "@/components/BottomSheet";
import { ActionSheet } from "@/screens/contacts/ActionSheet";
import {
  AlignLeft,
  Calendar,
  CalendarClock,
  Check,
  CircleDot,
  Clock,
  File,
  FolderOpen,
  Globe,
  Hash,
  Images,
  ListChecks,
  Lock,
  Mail,
  MessageCircle,
  Paperclip,
  Phone,
  Plus,
  Search,
  Tag,
  ToggleLeft,
  Trash2,
  Type,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { MonthGrid } from "@/screens/calendar/MonthGrid";
import { TimeWheel } from "@/screens/calendar/pickers/TimeWheel";
import { startOfMonth, todayKey } from "@/screens/calendar/dates";
import { explainPick, pickDocuments, pickMedia } from "@/screens/pages/addFiles";
import { useRichTextSession } from "@/stores/richTextSession.store";
import { displayValue, formatBytes, joinDateTime, linkedRecords, optionsFor, scalar, selectedIds, splitDateTime, type KnownRecords } from "./display";
import type { FieldWrites } from "./useFieldWrites";

const ICONS: Record<FieldType, LucideIcon> = {
  text: Type,
  long_text: AlignLeft,
  rich_text: AlignLeft,
  integer: Hash,
  decimal: Hash,
  boolean: ToggleLeft,
  date: Calendar,
  datetime: CalendarClock,
  single_select: CircleDot,
  multi_select: ListChecks,
  single_record: UserRound,
  multi_record: Users,
  attachment: Paperclip,
  attachments: Paperclip,
  phone: Phone,
  email: Mail,
  url: Globe,
  created_time: Clock,
  last_modified_time: Clock,
  lookup: Lock,
  rollup: Lock,
};

export function fieldIcon(field: FieldDefinition): LucideIcon {
  if (field.recordClass === "Core::Tag") return Tag;
  return ICONS[field.fieldType];
}

/** A field's icon, drawn (the icon is chosen from a table, never made during a render). */
export function FieldIcon({ field, size, color }: { field: FieldDefinition; size: number; color: string }) {
  return createElement(fieldIcon(field), { size, color });
}

/** The sheet animation's length: a picker opened straight after a sheet closes would open under it. */
const SHEET_CLOSE_MS = 320;

type Editor = "text" | "date" | "select" | "records" | "files" | null;

export function FieldRow({
  field,
  value,
  editable,
  writes,
  known,
  testID,
  onError,
}: {
  field: FieldDefinition;
  value: FieldValue | undefined;
  editable: boolean;
  writes: FieldWrites;
  known: KnownRecords;
  testID: string;
  onError?: (message: string) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [editor, setEditor] = useState<Editor>(null);
  const canEdit = editable && !isReadOnlyType(field.fieldType);
  const type = field.fieldType;
  const shown = displayValue(field, value, known, i18n.language);

  const open = () => {
    if (!canEdit) return;
    if (type === "rich_text") {
      useRichTextSession.getState().start({
        html: typeof scalar(value) === "string" ? (scalar(value) as string) : "",
        title: field.name,
        onDone: (html) => writes.setScalar.mutate({ field, value: html }),
      });
      router.push("/rich-text");
      return;
    }
    if (type === "boolean") {
      writes.setScalar.mutate({ field, value: !(scalar(value) === true) });
      return;
    }
    if (type === "date" || type === "datetime") setEditor("date");
    else if (type === "single_select" || type === "multi_select") setEditor("select");
    else if (type === "single_record" || type === "multi_record") setEditor("records");
    else if (type === "attachment" || type === "attachments") setEditor("files");
    else setEditor("text");
  };

  const valueNode = (() => {
    if (type === "boolean") {
      return (
        <Switch
          testID={`${testID}-switch`}
          value={scalar(value) === true}
          disabled={!canEdit}
          onValueChange={(on) => writes.setScalar.mutate({ field, value: on })}
          accessibilityLabel={field.name}
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      );
    }
    if ((type === "single_select" || type === "multi_select") && shown) {
      return <Chips items={optionsFor(field, value).map((o) => ({ key: o.value, label: o.label, color: o.color }))} />;
    }
    if ((type === "single_record" || type === "multi_record") && shown) {
      return <Chips items={linkedRecords(field, value, known).map((o) => ({ key: String(o.id), label: o.label, color: o.color }))} />;
    }
    if ((type === "attachment" || type === "attachments") && value?.kind === "files" && value.files.length) {
      return (
        <Text numberOfLines={1} style={{ flexShrink: 1 }}>
          {t("fields.fileCount", { count: value.files.length })}
        </Text>
      );
    }
    return (
      <Text testID={`${testID}-value`} numberOfLines={type === "long_text" || type === "rich_text" ? 3 : 1} tone={shown ? "default" : "muted"} style={{ flexShrink: 1 }}>
        {shown ?? (canEdit ? t("fields.empty") : "—")}
      </Text>
    );
  })();

  return (
    <>
      <Pressable
        testID={testID}
        onPress={type === "boolean" ? undefined : open}
        disabled={!canEdit || type === "boolean"}
        accessibilityRole={canEdit && type !== "boolean" ? "button" : undefined}
        accessibilityLabel={`${field.name}${field.required ? `, ${t("fields.required")}` : ""}: ${shown ?? t("fields.empty")}`}
        accessibilityHint={canEdit && type !== "boolean" ? t("fields.editHint") : undefined}
        style={{ flexDirection: "row", alignItems: "center", minHeight: metrics.touch, gap: metrics.space.md, paddingVertical: metrics.space.xs }}
      >
        <FieldIcon field={field} size={18} color={colors.inkMuted} />
        <Text variant="label" tone="muted" numberOfLines={2} style={{ width: "34%", fontWeight: "500" }}>
          {field.name}
          {field.required ? <Text tone="danger"> *</Text> : null}
        </Text>
        <View style={{ flex: 1, flexDirection: "row", justifyContent: type === "boolean" ? "flex-end" : "flex-start", alignItems: "center", minWidth: 0 }}>{valueNode}</View>
      </Pressable>

      {editor === "text" ? <TextSheet field={field} value={value} writes={writes} onClose={() => setEditor(null)} testID={`${testID}-sheet`} /> : null}
      {editor === "date" ? <DateSheet field={field} value={value} writes={writes} onClose={() => setEditor(null)} testID={`${testID}-sheet`} /> : null}
      {editor === "select" ? <SelectSheet field={field} value={value} writes={writes} onClose={() => setEditor(null)} testID={`${testID}-sheet`} /> : null}
      {editor === "records" ? <RecordPickerSheet field={field} value={value} writes={writes} known={known} onClose={() => setEditor(null)} testID={`${testID}-sheet`} /> : null}
      {editor === "files" ? <FilesSheet field={field} value={value} writes={writes} editable={canEdit} onClose={() => setEditor(null)} testID={`${testID}-sheet`} onError={onError} /> : null}
    </>
  );
}

function Chips({ items }: { items: { key: string; label: string; color: string | null }[] }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs, flexShrink: 1 }}>
      {items.map((item) => (
        <View
          key={item.key}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: metrics.radius.pill, backgroundColor: item.color ? `${item.color}26` : colors.surface, borderWidth: 1, borderColor: item.color ? `${item.color}66` : colors.border, maxWidth: "100%" }}
        >
          {item.color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} /> : null}
          <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ── Text and numbers ─────────────────────────────────────────────────────

/** Why a typed value cannot be saved, or null. Mirrors `FieldValueService#validate_scalar!` plus the formats. */
export function textProblem(field: FieldDefinition, text: string, t: (k: string, o?: Record<string, unknown>) => string): string | null {
  const v = text.trim();
  if (!v) return field.required ? t("fields.requiredError") : null;
  if (field.fieldType === "integer" || field.fieldType === "decimal") {
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n)) return t("fields.notANumber");
    if (field.fieldType === "integer" && !Number.isInteger(n)) return t("fields.wholeNumber");
    if (field.config.min != null && n < field.config.min) return t("fields.atLeast", { min: field.config.min });
    if (field.config.max != null && n > field.config.max) return t("fields.atMost", { max: field.config.max });
  }
  if (field.fieldType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return t("fields.badEmail");
  if (field.fieldType === "url" && !/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(v)) return t("fields.badUrl");
  return null;
}

/** What is sent for a typed value: a number for the number types, null for nothing. */
export function textToValue(field: FieldDefinition, text: string): unknown {
  const v = text.trim();
  if (!v) return null;
  if (field.fieldType === "integer") return Math.trunc(Number(v.replace(",", ".")));
  if (field.fieldType === "decimal") return Number(v.replace(",", "."));
  return v;
}

function TextSheet({ field, value, writes, onClose, testID }: { field: FieldDefinition; value: FieldValue | undefined; writes: FieldWrites; onClose: () => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const initial = scalar(value);
  const [text, setText] = useState(initial == null ? "" : String(initial));
  const [tried, setTried] = useState(false);
  const problem = textProblem(field, text, t);
  const multiline = field.fieldType === "long_text";
  const kind = field.fieldType;
  const keyboard = kind === "integer" ? "number-pad" : kind === "decimal" ? "decimal-pad" : kind === "phone" ? "phone-pad" : kind === "email" ? "email-address" : kind === "url" ? "url" : "default";
  const saved = initial == null ? "" : String(initial);

  const save = () => {
    setTried(true);
    if (problem) return;
    if (text.trim() !== saved.trim()) writes.setScalar.mutate({ field, value: textToValue(field, text) });
    onClose();
  };

  const link = (() => {
    const v = saved.trim();
    if (!v) return [];
    if (kind === "phone") {
      const digits = v.replace(/[^\d+]/g, "");
      return [
        { key: "call", label: t("fields.call"), icon: Phone, url: `tel:${digits}` },
        { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, url: `https://wa.me/${digits.replace(/^\+/, "")}` },
      ];
    }
    if (kind === "email") return [{ key: "mail", label: t("fields.writeEmail"), icon: Mail, url: `mailto:${v}` }];
    if (kind === "url") return [{ key: "open", label: t("fields.openLink"), icon: Globe, url: /^https?:\/\//i.test(v) ? v : `https://${v}` }];
    return [];
  })();

  return (
    <BottomSheet
      open
      title={field.name}
      onClose={onClose}
      testID={testID}
      footer={
        <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
          {saved ? (
            <SheetButton
              testID={`${testID}-clear`}
              label={t("fields.clear")}
              tone="neutral"
              onPress={() => {
                writes.setScalar.mutate({ field, value: null });
                onClose();
              }}
            />
          ) : null}
          <SheetButton testID={`${testID}-save`} label={t("fields.save")} onPress={save} />
        </View>
      }
    >
      <TextInput
        testID={`${testID}-input`}
        value={text}
        onChangeText={setText}
        autoFocus
        multiline={multiline}
        keyboardType={keyboard}
        autoCapitalize={kind === "email" || kind === "url" ? "none" : "sentences"}
        autoCorrect={kind === "text" || kind === "long_text"}
        returnKeyType={multiline ? "default" : "done"}
        onSubmitEditing={multiline ? undefined : save}
        accessibilityLabel={field.name}
        placeholder={field.fieldType === "integer" && field.config.min != null && field.config.max != null ? `${field.config.min}–${field.config.max}` : field.name}
        placeholderTextColor={colors.inkMuted}
        style={{ minHeight: multiline ? 120 : 48, textAlignVertical: multiline ? "top" : "center", borderWidth: 1, borderColor: tried && problem ? colors.danger : colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, paddingVertical: metrics.space.sm, color: colors.ink, fontSize: 16, backgroundColor: colors.surface }}
      />
      {tried && problem ? (
        <Text testID={`${testID}-error`} tone="danger" variant="caption" accessibilityLiveRegion="polite" style={{ marginTop: metrics.space.xs }}>
          {problem}
        </Text>
      ) : null}
      {link.length ? (
        <View style={{ flexDirection: "row", gap: metrics.space.sm, marginTop: metrics.space.md, flexWrap: "wrap" }}>
          {link.map((l) => (
            <Pressable
              key={l.key}
              testID={`${testID}-${l.key}`}
              onPress={() => void Linking.openURL(l.url)}
              accessibilityRole="link"
              accessibilityLabel={l.label}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: colors.border }}
            >
              <l.icon size={16} color={colors.ink} />
              <Text variant="label">{l.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </BottomSheet>
  );
}

export function SheetButton({ label, onPress, tone = "accent", disabled = false, busy = false, testID }: { label: string; onPress: () => void; tone?: "accent" | "neutral" | "danger"; disabled?: boolean; busy?: boolean; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const bg = tone === "accent" ? colors.accent : tone === "danger" ? colors.danger : colors.surface;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={{ flex: 1, minHeight: metrics.touch, borderRadius: metrics.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: bg, opacity: disabled ? 0.5 : 1, borderWidth: tone === "neutral" ? 1 : 0, borderColor: colors.border }}
    >
      {busy ? <ActivityIndicator color={tone === "neutral" ? colors.ink : colors.onAccent} /> : <Text variant="label" tone={tone === "neutral" ? "default" : "onAccent"}>{label}</Text>}
    </Pressable>
  );
}

// ── Dates ────────────────────────────────────────────────────────────────

function DateSheet({ field, value, writes, onClose, testID }: { field: FieldDefinition; value: FieldValue | undefined; writes: FieldWrites; onClose: () => void; testID: string }) {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const today = todayKey();
  const raw = scalar(value);
  const withTime = field.fieldType === "datetime";
  const parts = typeof raw === "string" ? (withTime ? splitDateTime(raw) : { day: raw.slice(0, 10), time: "09:00" }) : null;
  const [day, setDay] = useState<string | null>(parts?.day ?? null);
  const [time, setTime] = useState(parts?.time ?? "09:00");
  const [month, setMonth] = useState(startOfMonth(parts?.day ?? today));

  const save = (pickedDay: string | null, pickedTime = time) => {
    writes.setScalar.mutate({ field, value: pickedDay == null ? null : withTime ? joinDateTime(pickedDay, pickedTime) : pickedDay });
    onClose();
  };

  return (
    <BottomSheet
      open
      title={field.name}
      onClose={onClose}
      testID={testID}
      footer={
        <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
          {raw ? <SheetButton testID={`${testID}-clear`} label={t("fields.clear")} tone="neutral" onPress={() => save(null)} /> : null}
          {withTime ? <SheetButton testID={`${testID}-save`} label={t("fields.save")} disabled={!day} onPress={() => save(day)} /> : null}
        </View>
      }
    >
      <MonthGrid
        testID={`${testID}-month`}
        month={month}
        selected={day}
        today={today}
        onMonthChange={setMonth}
        onSelect={(picked) => {
          setDay(picked);
          // A date alone is complete on the tap, as the Calendar's own picker.
          if (!withTime) save(picked);
        }}
      />
      {withTime ? (
        <View style={{ marginTop: metrics.space.md, alignItems: "center" }}>
          <TimeWheel value={time} onChange={setTime} testID={`${testID}-time`} label={field.name} />
        </View>
      ) : null}
    </BottomSheet>
  );
}

// ── Options ──────────────────────────────────────────────────────────────

function SelectSheet({ field, value, writes, onClose, testID }: { field: FieldDefinition; value: FieldValue | undefined; writes: FieldWrites; onClose: () => void; testID: string }) {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const multi = field.fieldType === "multi_select";
  const [picked, setPicked] = useState<string[]>(optionsFor(field, value).map((o) => o.value));

  const choose = (option: SelectOption) => {
    if (!multi) {
      writes.setScalar.mutate({ field, value: option.value });
      onClose();
      return;
    }
    setPicked((now) => (now.includes(option.value) ? now.filter((v) => v !== option.value) : [...now, option.value]));
  };

  return (
    <BottomSheet
      open
      title={field.name}
      onClose={onClose}
      testID={testID}
      footer={
        multi ? (
          <SheetButton
            testID={`${testID}-save`}
            label={t("fields.save")}
            onPress={() => {
              writes.setScalar.mutate({ field, value: field.config.options.map((o) => o.value).filter((v) => picked.includes(v)) });
              onClose();
            }}
          />
        ) : !field.required && optionsFor(field, value).length ? (
          <SheetButton
            testID={`${testID}-clear`}
            label={t("fields.clear")}
            tone="neutral"
            onPress={() => {
              writes.setScalar.mutate({ field, value: null });
              onClose();
            }}
          />
        ) : undefined
      }
    >
      <View style={{ gap: 2 }}>
        {field.config.options.map((option) => (
          <ChoiceRow key={option.value} testID={`${testID}-${option.value}`} label={option.label} color={option.color} selected={picked.includes(option.value)} multi={multi} onPress={() => choose(option)} />
        ))}
        {field.config.options.length === 0 ? (
          <Text tone="muted" style={{ paddingVertical: metrics.space.md }}>
            {t("fields.noOptions")}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

export function ChoiceRow({ label, color, selected, multi, onPress, testID, avatar }: { label: string; color?: string | null; selected: boolean; multi: boolean; onPress: () => void; testID: string; avatar?: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: metrics.touch + 4 }}
    >
      {avatar ? (
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border, alignItems: "center", justifyContent: "center" }}>
          <Text variant="caption" style={{ fontWeight: "700" }}>
            {avatar}
          </Text>
        </View>
      ) : color ? (
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color }} />
      ) : null}
      <Text numberOfLines={2} style={{ flex: 1 }}>
        {label}
      </Text>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: multi ? 6 : 12,
          borderWidth: 2,
          borderColor: selected ? colors.accent : colors.border,
          backgroundColor: selected ? colors.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected ? <Check size={16} color={colors.onAccent} /> : null}
      </View>
    </Pressable>
  );
}

// ── Linked records ───────────────────────────────────────────────────────

const initialsOf = (label: string) => {
  const w = label.trim().split(/\s+/).filter(Boolean);
  return w.length > 1 ? (w[0][0] + w[w.length - 1][0]).toUpperCase() : (w[0] ?? "?").slice(0, 2).toUpperCase();
};

/**
 * Pick linked records: the server's choices for this field (`record_options`,
 * searched there, 20 a page, more on scroll). A tap links or unlinks at once,
 * as on the web; a single-record field replaces its link and closes.
 */
export function RecordPickerSheet({
  field,
  value,
  writes,
  known,
  onClose,
  testID,
}: {
  field: FieldDefinition;
  value: FieldValue | undefined;
  writes: FieldWrites;
  known: KnownRecords;
  onClose: () => void;
  testID: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(false);
  const multi = field.fieldType === "multi_record";
  const selected = selectedIds(value);
  const isUser = field.recordClass === "User";

  // A typed search settles before it is sent (the web waits 300 ms).
  useEffect(() => {
    const id = setTimeout(() => setTerm(typed.trim()), 300);
    return () => clearTimeout(id);
  }, [typed]);

  const options = useInfiniteQuery({
    queryKey: fieldKeys.options(field.id, term),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fieldsApi.recordOptions(field.id, term, pageParam),
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
  const rows: RecordOption[] = useMemo(() => {
    const fromServer = options.data?.pages.flatMap((p) => p.options) ?? [];
    // Before the server answers, what the screen already knows (the board's people, its labels).
    if (fromServer.length || options.data) return fromServer;
    const q = term.toLowerCase();
    return known(field).filter((o) => o.label.toLowerCase().includes(q));
  }, [options.data, known, field, term]);

  const exact = rows.some((r) => r.label.trim().toLowerCase() === term.trim().toLowerCase());
  const canCreate = field.recordClass === "Core::Tag" && field.config.allowCreate && field.tagCategoryId != null && term.trim().length > 0 && !exact && Boolean(options.data);

  const toggle = (option: RecordOption) => {
    const sel = value?.kind === "records" ? value.selections.find((s) => s.recordId === option.id) : undefined;
    if (sel) writes.unlink.mutate({ field, selection: sel });
    else writes.link.mutate({ field, recordId: option.id });
    if (!multi && !sel) onClose();
  };

  const create = async () => {
    if (field.tagCategoryId == null) return;
    setCreating(true);
    try {
      const tag = await fieldsApi.createTag(field.tagCategoryId, term.trim(), null);
      writes.link.mutate({ field, recordId: tag.id });
      setTyped("");
      void options.refetch();
    } catch (e) {
      Alert.alert(t("fields.failed"), failureMessage(e, t("fields.failed")));
    } finally {
      setCreating(false);
    }
  };

  return (
    <BottomSheet open title={field.name} onClose={onClose} testID={testID} scroll={false} tall>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, backgroundColor: colors.surface, marginBottom: metrics.space.sm }}>
        <Search size={18} color={colors.inkMuted} />
        <TextInput
          testID={`${testID}-search`}
          value={typed}
          onChangeText={setTyped}
          placeholder={t("fields.search")}
          placeholderTextColor={colors.inkMuted}
          autoCorrect={false}
          accessibilityLabel={t("fields.search")}
          style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }}
        />
        {typed ? (
          <Pressable onPress={() => setTyped("")} accessibilityRole="button" accessibilityLabel={t("fields.clearSearch")} hitSlop={8}>
            <X size={18} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>
      {canCreate ? (
        <Pressable
          testID={`${testID}-create`}
          onPress={() => void create()}
          disabled={creating}
          accessibilityRole="button"
          accessibilityLabel={t("fields.createLabel", { label: term.trim() })}
          style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: metrics.touch }}
        >
          {creating ? <ActivityIndicator color={colors.accent} /> : <Plus size={20} color={colors.accent} />}
          <Text tone="accent" variant="label">
            {t("fields.createLabel", { label: term.trim() })}
          </Text>
        </Pressable>
      ) : null}
      <FlatList
        testID={`${testID}-list`}
        data={rows}
        keyExtractor={(o) => String(o.id)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ChoiceRow
            testID={`${testID}-option`}
            label={item.label}
            color={item.color}
            avatar={isUser ? initialsOf(item.label) : undefined}
            selected={selected.includes(item.id)}
            multi={multi}
            onPress={() => toggle(item)}
          />
        )}
        onEndReached={() => {
          if (options.hasNextPage && !options.isFetchingNextPage) void options.fetchNextPage();
        }}
        ListEmptyComponent={
          options.isPending ? (
            <ActivityIndicator style={{ marginTop: metrics.space.lg }} color={colors.inkMuted} />
          ) : options.error ? (
            <Pressable onPress={() => void options.refetch()} accessibilityRole="button" style={{ paddingVertical: metrics.space.lg }}>
              <Text tone="danger">{failureMessage(options.error, t("fields.loadFailed"))}</Text>
              <Text tone="accent" variant="label">
                {t("fields.retry")}
              </Text>
            </Pressable>
          ) : canCreate ? null : (
            <Text tone="muted" style={{ paddingVertical: metrics.space.lg }} testID={`${testID}-empty`}>
              {term ? t("fields.noMatch") : isUser && field.config.scope === "project_members" ? t("fields.noPeople") : t("fields.nothingToPick")}
            </Text>
          )
        }
        ListFooterComponent={options.isFetchingNextPage ? <ActivityIndicator color={colors.inkMuted} /> : null}
      />
    </BottomSheet>
  );
}

// ── Files ────────────────────────────────────────────────────────────────

function FilesSheet({
  field,
  value,
  writes,
  editable,
  onClose,
  testID,
  onError,
}: {
  field: FieldDefinition;
  value: FieldValue | undefined;
  writes: FieldWrites;
  editable: boolean;
  onClose: () => void;
  testID: string;
  onError?: (message: string) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [choosing, setChoosing] = useState(false);
  const files = value?.kind === "files" ? value.files : [];
  const one = field.fieldType === "attachment";
  const uploading = writes.upload.isPending;

  const add = async (pick: typeof pickDocuments) => {
    const picked = explainPick(await pick(), t);
    if (!picked) return;
    for (const file of one ? picked.slice(0, 1) : picked) {
      const name = file.name ?? file.uri.split("/").pop() ?? "file";
      writes.upload.mutate(
        { field, file: { uri: file.uri, name, mimeType: file.mimeType ?? "application/octet-stream" } },
        { onError: (e) => onError?.(failureMessage(e, t("fields.uploadFailed"))) },
      );
    }
  };

  const confirmRemove = (file: FieldFile) =>
    Alert.alert(t("fields.removeFileTitle"), t("fields.removeFileBody", { name: file.filename }), [
      { text: t("fields.cancel"), style: "cancel" },
      { text: t("fields.remove"), style: "destructive", onPress: () => writes.removeFile.mutate({ field, file }) },
    ]);

  return (
    <BottomSheet
      open
      title={field.name}
      onClose={onClose}
      testID={testID}
      footer={
        editable && !(one && files.length > 0) ? (
          <SheetButton testID={`${testID}-add`} label={one ? t("fields.addFile") : t("fields.addFiles")} busy={uploading} onPress={() => setChoosing(true)} />
        ) : undefined
      }
    >
      {files.length === 0 && !uploading ? (
        <Text tone="muted" style={{ paddingVertical: metrics.space.md }}>
          {t("fields.noFiles")}
        </Text>
      ) : null}
      {files.map((file) => (
        <View key={file.id} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 56 }}>
          <Pressable
            testID={`${testID}-file`}
            onPress={() => file.url && void Linking.openURL(file.url)}
            accessibilityRole="link"
            accessibilityLabel={t("fields.openFile", { name: file.filename })}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: metrics.space.md }}
          >
            <View style={{ width: 40, height: 40, borderRadius: metrics.radius.sm, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}>
              <File size={20} color={colors.inkMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1}>{file.filename}</Text>
              <Text variant="caption" tone="muted">
                {formatBytes(file.byteSize, i18n.language)}
              </Text>
            </View>
          </Pressable>
          {editable ? (
            <Pressable testID={`${testID}-remove`} onPress={() => confirmRemove(file)} accessibilityRole="button" accessibilityLabel={t("fields.removeFile", { name: file.filename })} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Trash2 size={18} color={colors.danger} />
            </Pressable>
          ) : null}
        </View>
      ))}
      {uploading ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 56 }} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.accent} />
          <Text tone="muted">{t("fields.uploading")}</Text>
        </View>
      ) : null}
      <ActionSheet
        open={choosing}
        title={one ? t("fields.addFile") : t("fields.addFiles")}
        onClose={() => setChoosing(false)}
        testID={`${testID}-source`}
        actions={[
          { key: "photos", label: t("fields.fromPhotos"), icon: Images, onPress: () => setTimeout(() => void add(pickMedia), SHEET_CLOSE_MS) },
          { key: "files", label: t("fields.fromFiles"), icon: FolderOpen, onPress: () => setTimeout(() => void add(pickDocuments), SHEET_CLOSE_MS) },
        ]}
      />
    </BottomSheet>
  );
}
