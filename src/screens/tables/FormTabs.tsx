/**
 * THE FORM BUILDER'S TABS (increment 8; the web's `FormBuilder.tsx`):
 *   Questions: the columns asked, in order, each with its wording, required
 *              (locked when the column requires it) and hidden; add or remove.
 *   Page:      the form's name, title, intro, button, thank-you, language,
 *              cover (a colour or an image), and whether it takes answers.
 *   Share:     who can fill it, its link (copy, share, open), and invitations
 *              by email (each one an EMAIL to a real person: said first).
 *   Answers:   who answered, newest first; each opens its row.
 * Rules are `formBuilder.ts`'s; saving is `useFormEdit`.
 */
import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, Share, Switch, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { ACCESS_MODES, publicFormUrl, tableFormsApi, type FormChanges, type FormQuestion, type FormSettings, type TableForm } from "@/api/tableForms";
import { SheetButton } from "@/components/fields/FieldRow";
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, Plus, Share2, Trash2, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { relativeTime } from "@/lib/relativeTime";
import { pickPhotos } from "@/screens/contacts/documents";
import { explainPick } from "@/screens/pages/addFiles";
import { DateValue } from "./FilterSortSheet";
import { FORM_LANGUAGES, moveQuestion, parseEmails, questionFor, requiredState, TAKES_PLACEHOLDER, unusedFields } from "./formBuilder";
import { OPTION_PALETTE } from "./palette";
import { LoadFailure } from "@/components/LoadFailure";

/** A change, or one built from the form as the last save left it (`useFormEdit`). */
type Save = (c: FormChanges | ((current: TableForm) => FormChanges)) => void;

function useInputStyle() {
  const colors = useColors();
  const metrics = useMetrics();
  return { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface };
}

/** A text that saves when the person leaves it, and only when it changed. */
function SavedText({ testID, label, value, onSave, multiline, placeholder, maxLength, keyboardType }: { testID: string; label: string; value: string; onSave: (v: string) => void; multiline?: boolean; placeholder?: string; maxLength?: number; keyboardType?: "default" | "number-pad" }) {
  const colors = useColors();
  const metrics = useMetrics();
  const input = useInputStyle();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <View style={{ gap: 4 }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <TextInput testID={testID} value={draft} onChangeText={setDraft} onEndEditing={() => draft !== value && onSave(draft)} multiline={multiline} placeholder={placeholder} maxLength={maxLength} keyboardType={keyboardType} accessibilityLabel={label} placeholderTextColor={colors.inkMuted} style={[input, multiline ? { minHeight: 80, paddingVertical: metrics.space.sm, textAlignVertical: "top" as const } : null]} />
    </View>
  );
}

function Toggle({ testID, label, value, disabled, onChange }: { testID: string; label: string; value: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: metrics.touch, gap: metrics.space.sm }}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Switch testID={testID} value={value} disabled={disabled} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: colors.accent, false: colors.border }} />
    </View>
  );
}

function Chip({ testID, on, label, onPress, hint }: { testID: string; on: boolean; label: string; onPress: () => void; hint?: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label} accessibilityHint={hint} style={{ minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center", borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.surface }}>
      <Text variant="label" tone={on ? "onAccent" : "default"}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Questions ──────────────────────────────────────────────────────────────

export function QuestionsTab({ form, save }: { form: TableForm; save: Save }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const byId = new Map(form.availableFields.map((f) => [f.id, f]));
  // Built from the form as the last save left it, never from this render's copy: two quick edits keep both (M3).
  const set = (next: (questions: FormQuestion[]) => FormQuestion[]) => save((current) => ({ questions: next(current.questions) }));
  const move = (fieldId: number, by: -1 | 1) =>
    set((qs) => {
      const at = qs.findIndex((x) => x.fieldId === fieldId);
      return at < 0 ? qs : moveQuestion(qs, at, by);
    });
  const update = (fieldId: number, patch: Partial<FormQuestion>) => set((qs) => qs.map((q) => (q.fieldId === fieldId ? { ...q, ...patch } : q)));
  const unused = unusedFields(form);

  return (
    <View style={{ gap: metrics.space.sm }}>
      {form.questions.length === 0 ? (
        <Text tone="muted" testID="tables-form-no-questions">
          {t("tables.form.noQuestions")}
        </Text>
      ) : null}
      {form.questions.map((q, i) => {
        const field = byId.get(q.fieldId);
        const req = requiredState(q, field);
        const name = field?.name ?? t("tables.form.goneColumn");
        return (
          <View key={q.fieldId} testID={`tables-form-question-${i}`} style={{ gap: metrics.space.xs, padding: metrics.space.sm, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
              <View style={{ flex: 1 }}>
                <Text variant="label" numberOfLines={1}>
                  {q.label || name}
                </Text>
                <Text tone="muted" variant="caption">
                  {field ? `${name} · ${t(`fields.types.${field.fieldType}`, { defaultValue: field.fieldType })}` : name}
                </Text>
              </View>
              <Pressable testID={`tables-form-question-${i}-up`} disabled={i === 0} onPress={() => move(q.fieldId, -1)} accessibilityRole="button" accessibilityLabel={t("tables.form.up", { question: q.label || name })} style={{ width: 36, height: 44, alignItems: "center", justifyContent: "center", opacity: i === 0 ? 0.3 : 1 }}>
                <ArrowUp size={16} color={colors.ink} />
              </Pressable>
              <Pressable testID={`tables-form-question-${i}-down`} disabled={i === form.questions.length - 1} onPress={() => move(q.fieldId, 1)} accessibilityRole="button" accessibilityLabel={t("tables.form.down", { question: q.label || name })} style={{ width: 36, height: 44, alignItems: "center", justifyContent: "center", opacity: i === form.questions.length - 1 ? 0.3 : 1 }}>
                <ArrowDown size={16} color={colors.ink} />
              </Pressable>
              <Pressable testID={`tables-form-question-${i}-remove`} onPress={() => set((qs) => qs.filter((x) => x.fieldId !== q.fieldId))} accessibilityRole="button" accessibilityLabel={t("tables.form.remove", { question: q.label || name })} style={{ width: 36, height: 44, alignItems: "center", justifyContent: "center" }}>
                <X size={16} color={colors.inkMuted} />
              </Pressable>
            </View>
            <SavedText testID={`tables-form-question-${i}-label`} label={t("tables.form.label")} value={q.label ?? ""} placeholder={name} maxLength={200} onSave={(v) => update(q.fieldId, { label: v.trim() || null })} />
            <SavedText testID={`tables-form-question-${i}-help`} label={t("tables.form.help")} value={q.help ?? ""} maxLength={1000} multiline onSave={(v) => update(q.fieldId, { help: v.trim() || null })} />
            {field && TAKES_PLACEHOLDER.includes(field.fieldType) ? <SavedText testID={`tables-form-question-${i}-placeholder`} label={t("tables.form.placeholder")} value={q.placeholder ?? ""} maxLength={120} onSave={(v) => update(q.fieldId, { placeholder: v.trim() || null })} /> : null}
            <Toggle testID={`tables-form-question-${i}-required`} label={req.locked ? t("tables.form.requiredByColumn") : t("tables.form.required")} value={req.on} disabled={req.locked} onChange={(required) => update(q.fieldId, { required })} />
            <Toggle testID={`tables-form-question-${i}-hidden`} label={t("tables.form.hidden")} value={q.hidden} onChange={(hidden) => update(q.fieldId, { hidden })} />
          </View>
        );
      })}
      {unused.length ? (
        <>
          <Text variant="label">{t("tables.form.add")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
            {unused.map((f) => (
              <Pressable key={f.id} testID={`tables-form-add-${f.id}`} onPress={() => set((qs) => (qs.some((x) => x.fieldId === f.id) ? qs : [...qs, questionFor(f)]))} accessibilityRole="button" accessibilityLabel={t("tables.form.addOne", { column: f.name })} style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: colors.border }}>
                <Plus size={14} color={colors.accent} />
                <Text variant="label">{f.name}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      {form.availableFields.some((f) => !f.supported) ? (
        <Text tone="muted" variant="caption">
          {t("tables.form.unsupported", { columns: form.availableFields.filter((f) => !f.supported).map((f) => f.name).join(", ") })}
        </Text>
      ) : null}
    </View>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export function PageTab({ form, save, run, onDelete }: { form: TableForm; save: Save; run: (work: () => Promise<TableForm>) => Promise<boolean>; onDelete: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const setting = (s: FormSettings) => save({ settings: s });
  const cover = async () => {
    const picked = explainPick(await pickPhotos(), t)?.[0];
    if (!picked) return;
    if (picked.size !== null && picked.size > 5 * 1024 * 1024) {
      Alert.alert(t("tables.form.coverTooBig"));
      return;
    }
    await run(() => tableFormsApi.uploadCover(form.id, { uri: picked.uri, name: picked.name ?? "cover.jpg", mimeType: picked.mimeType ?? "image/jpeg" }));
  };

  return (
    <View style={{ gap: metrics.space.sm }}>
      <SavedText testID="tables-form-name" label={t("tables.form.name")} value={form.name} maxLength={120} onSave={(v) => v.trim() && save({ name: v.trim() })} />
      <SavedText testID="tables-form-title" label={t("tables.form.title")} value={form.settings.title ?? ""} placeholder={form.name} maxLength={200} onSave={(v) => setting({ title: v.trim() || null })} />
      <SavedText testID="tables-form-intro" label={t("tables.form.intro")} value={form.settings.intro ?? ""} maxLength={5000} multiline onSave={(v) => setting({ intro: v.trim() || null })} />
      <SavedText testID="tables-form-submit" label={t("tables.form.submitLabel")} value={form.settings.submit_label ?? ""} placeholder={t("tables.form.submitDefault")} maxLength={60} onSave={(v) => setting({ submit_label: v.trim() || null })} />
      <SavedText testID="tables-form-success" label={t("tables.form.success")} value={form.settings.success_message ?? ""} maxLength={2000} multiline onSave={(v) => setting({ success_message: v.trim() || null })} />

      <Text variant="label">{t("tables.form.language")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
        {FORM_LANGUAGES.map((l) => (
          <Chip key={l.code || "auto"} testID={`tables-form-language-${l.code || "auto"}`} on={(form.settings.language ?? "") === l.code} label={l.name ?? t("tables.form.languageAuto")} onPress={() => setting({ language: l.code || null })} />
        ))}
      </View>
      <Text tone="muted" variant="caption">
        {t("tables.form.languageHint")}
      </Text>

      <Text variant="label">{t("tables.form.cover")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm, alignItems: "center" }}>
        {OPTION_PALETTE.map((hex, i) => {
          const on = !form.coverUrl && form.settings.cover_color === hex;
          return (
            <Pressable key={hex} testID={`tables-form-cover-color-${i}`} onPress={() => setting({ cover_color: hex })} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t("tables.admin.colorN", { n: i + 1 })} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: hex, alignItems: "center", justifyContent: "center", borderWidth: on ? 3 : 0, borderColor: colors.ink }}>
              {on ? <Check size={16} color={colors.onAccent} /> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
        <View style={{ flex: 1 }}>
          <SheetButton testID="tables-form-cover-image" label={form.coverUrl ? t("tables.form.coverReplace") : t("tables.form.coverImage")} tone="neutral" onPress={() => void cover()} />
        </View>
        {form.coverUrl ? (
          <View style={{ flex: 1 }}>
            <SheetButton testID="tables-form-cover-remove" label={t("tables.form.coverRemove")} tone="neutral" onPress={() => void run(() => tableFormsApi.removeCover(form.id))} />
          </View>
        ) : null}
      </View>

      <Text variant="label">{t("tables.form.answersTitle")}</Text>
      <Toggle testID="tables-form-accepting" label={t("tables.form.accepting")} value={form.accepting} onChange={(accepting) => save({ accepting })} />
      <Toggle testID="tables-form-multiple" label={t("tables.form.allowMultiple")} value={form.allowMultiple} onChange={(allowMultiple) => save({ allowMultiple })} />
      <SavedText testID="tables-form-max" label={t("tables.form.max")} value={form.maxSubmissions ? String(form.maxSubmissions) : ""} keyboardType="number-pad" placeholder={t("tables.form.noLimit")} onSave={(v) => save({ maxSubmissions: /^\d+$/.test(v.trim()) && Number(v) > 0 ? Number(v) : null })} />
      <Text variant="caption" tone="muted">
        {t("tables.form.closesAt")}
      </Text>
      <DateValue value={form.closesAt ? form.closesAt.slice(0, 10) : null} onChange={(d) => save({ closesAt: d })} testID="tables-form-closes" label={t("tables.form.closesAt")} />

      <View style={{ marginTop: metrics.space.lg }}>
        <SheetButton testID="tables-form-delete" label={t("tables.form.delete")} tone="danger" onPress={onDelete} />
      </View>
    </View>
  );
}

// ── Share ──────────────────────────────────────────────────────────────────

export function ShareTab({ form, save, run }: { form: TableForm; save: Save; run: (work: () => Promise<TableForm>) => Promise<boolean> }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const input = useInputStyle();
  const url = publicFormUrl(form.slug);
  const [emails, setEmails] = useState("");
  const [copied, setCopied] = useState(false);
  const parsed = parseEmails(emails);

  const invite = () =>
    Alert.alert(t("tables.form.inviteTitle", { count: parsed.valid.length }), t("tables.form.inviteBody", { emails: parsed.valid.join(", ") }), [
      { text: t("fields.cancel"), style: "cancel" },
      {
        text: t("tables.form.inviteSend"),
        onPress: () =>
          void run(async () => {
            const out = await tableFormsApi.invite(form.id, parsed.valid);
            setEmails("");
            return out.form;
          }),
      },
    ]);

  return (
    <View style={{ gap: metrics.space.sm }}>
      <Text variant="label">{t("tables.form.who")}</Text>
      {ACCESS_MODES.map((m) => {
        const on = form.accessMode === m;
        return (
          <Pressable key={m} testID={`tables-form-access-${m}`} onPress={() => save({ accessMode: m })} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${t(`tables.forms.access.${m}`)}. ${t(`tables.form.accessHint.${m}`)}`} style={{ padding: metrics.space.sm, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? `${colors.accent}14` : colors.surface }}>
            <Text variant="label" tone={on ? "accent" : "default"}>
              {t(`tables.forms.access.${m}`)}
            </Text>
            <Text tone="muted" variant="caption">
              {t(`tables.form.accessHint.${m}`)}
            </Text>
          </Pressable>
        );
      })}

      <Text variant="label">{t("tables.form.link")}</Text>
      <Text tone="muted" variant="caption" selectable testID="tables-form-url" numberOfLines={2}>
        {url}
      </Text>
      <View style={{ flexDirection: "row", gap: metrics.space.xs }}>
        <LinkButton testID="tables-form-copy" icon={copied ? Check : Copy} label={copied ? t("tables.form.copied") : t("tables.form.copy")} onPress={() => void Clipboard.setStringAsync(url).then(() => setCopied(true))} />
        <LinkButton testID="tables-form-share" icon={Share2} label={t("tables.form.share")} onPress={() => void Share.share({ message: url })} />
        <LinkButton testID="tables-form-open" icon={ExternalLink} label={t("tables.form.open")} onPress={() => void Linking.openURL(url)} />
      </View>

      {form.accessMode === "invited" ? (
        <>
          <Text variant="label">{t("tables.form.invited")}</Text>
          {form.invites.length === 0 ? <Text tone="muted">{t("tables.form.nobodyInvited")}</Text> : null}
          {form.invites.map((i, n) => (
            <View key={i.id} testID={`tables-form-invite-${n}`} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1}>{i.email}</Text>
                <Text tone="muted" variant="caption">
                  {i.usedAt ? t("tables.form.answered") : i.joined ? t("tables.form.joined") : t("tables.form.waiting")}
                </Text>
              </View>
              {i.usedAt ? null : (
                <Pressable testID={`tables-form-invite-${n}-resend`} onPress={() => void tableFormsApi.resend(form.id, i.id).then(() => Alert.alert(t("tables.form.resent", { email: i.email })))} accessibilityRole="button" accessibilityLabel={t("tables.form.resend", { email: i.email })} style={{ minHeight: 36, paddingHorizontal: metrics.space.sm, justifyContent: "center" }}>
                  <Text tone="accent" variant="caption">
                    {t("tables.form.resendShort")}
                  </Text>
                </Pressable>
              )}
              <Pressable testID={`tables-form-invite-${n}-remove`} onPress={() => void run(() => tableFormsApi.uninvite(form.id, i.id))} accessibilityRole="button" accessibilityLabel={t("tables.form.uninvite", { email: i.email })} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
                <Trash2 size={16} color={colors.inkMuted} />
              </Pressable>
            </View>
          ))}
          <TextInput testID="tables-form-emails" value={emails} onChangeText={setEmails} multiline autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder={t("tables.form.emailsPlaceholder")} accessibilityLabel={t("tables.form.emailsPlaceholder")} placeholderTextColor={colors.inkMuted} style={[input, { minHeight: 64, paddingVertical: metrics.space.sm, textAlignVertical: "top" }]} />
          {parsed.invalid.length ? (
            <Text tone="danger" variant="caption" testID="tables-form-emails-invalid">
              {t("tables.form.notEmails", { list: parsed.invalid.join(", ") })}
            </Text>
          ) : null}
          <Text tone="muted" variant="caption">
            {t("tables.form.emailWarning")}
          </Text>
          <SheetButton testID="tables-form-invite" label={t("tables.form.inviteN", { count: parsed.valid.length })} disabled={parsed.valid.length === 0 || parsed.invalid.length > 0} onPress={invite} />
        </>
      ) : null}
    </View>
  );
}

function LinkButton({ testID, icon: Icon, label, onPress }: { testID: string; icon: typeof Copy; label: string; onPress: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: metrics.touch, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <Icon size={16} color={colors.ink} />
      <Text variant="label" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Answers ────────────────────────────────────────────────────────────────

export function AnswersTab({ form }: { form: TableForm }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const answers = useInfiniteQuery({
    queryKey: tablesKeys.formAnswers(form.id),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => tableFormsApi.submissions(form.id, pageParam),
    getNextPageParam: (last, pages) => {
      const seen = pages.reduce((n, p) => n + p.rows.length, 0);
      return seen < last.total && last.rows.length ? seen : undefined;
    },
  });
  const rows = answers.data?.pages.flatMap((p) => p.rows) ?? [];
  const total = answers.data?.pages[0]?.total ?? 0;

  return (
    <View style={{ gap: metrics.space.xs }}>
      <Text variant="label" testID="tables-form-answers-count">
        {t("tables.forms.answers", { count: total })}
      </Text>
      {answers.data && rows.length === 0 ? <Text tone="muted">{t("tables.form.noAnswers")}</Text> : null}
      <LoadFailure error={answers.error} loadFailed={t("tables.form.answersFailed")} hasData={Boolean(answers.data)} updatedAt={answers.dataUpdatedAt} onRetry={() => void answers.refetch()} testID="tables-form-answers-failed" padded={false} />
      {rows.map((a, i) => (
        <Pressable key={a.id} testID={`tables-form-answer-${i}`} disabled={!a.recordId} onPress={() => a.recordId && router.push({ pathname: "/tables/record", params: { table: String(form.tableId), id: String(a.recordId) } })} accessibilityRole="button" accessibilityLabel={`${a.recordTitle ?? t("tables.form.untitled")}, ${a.submitterName ?? a.submitterEmail ?? t("tables.form.anonymous")}`} style={{ minHeight: 56, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text variant="label" numberOfLines={1}>
            {a.recordTitle ?? (a.recordId ? t("tables.form.untitled") : t("tables.form.rowGone"))}
          </Text>
          <Text tone="muted" variant="caption" numberOfLines={1}>
            {[a.submitterName ?? a.submitterEmail ?? t("tables.form.anonymous"), relativeTime(a.createdAt)].join(" · ")}
          </Text>
        </Pressable>
      ))}
      {answers.hasNextPage ? <SheetButton testID="tables-form-answers-more" label={t("tables.history.older")} tone="neutral" onPress={() => void answers.fetchNextPage()} /> : null}
    </View>
  );
}
