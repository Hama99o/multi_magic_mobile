/**
 * The contact form (`docs/design/contacts/SPEC.md` §C.6) — the Calendar's
 * pattern: Cancel · title · Save, the save error under the header, problems
 * shown only after a Save was tried.
 *
 * Photo first (Mesh: the avatar with an edit badge), then names in one card,
 * then phones and emails as lists — each row a label chip and a value, ✕ to
 * remove, "+ Add phone" under it (Jobber, Garmin) — then work, birthday,
 * gender and closeness, address, website, notes, social links, tags (the
 * web drawer's fields and allowed values, audit #24). Every field is one a
 * person might type with the keyboard up, so the scroll view keeps taps and
 * the keyboard behaves.
 */
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Keyboard, Pressable, ScrollView, Switch, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { useTranslation } from "react-i18next";
import { Cake, Camera, MapPin, Plus, Star, Users, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { CLOSENESS, EMAIL_LABELS, GENDERS, PHONE_LABELS, SOCIAL_LABELS } from "@/api/contacts";
import { DateWheels } from "@/screens/calendar/pickers";
import { ContactAvatar } from "./ContactAvatar";
import { router } from "expo-router";
import { RichText } from "@/components/RichText";
import { useRichTextSession } from "@/stores/richTextSession.store";
import { ActionSheet } from "./ActionSheet";
import { addEntry, addTag, emptyAddress, problems, removeEntry, removeTag, setAddress, setEntry, type Draft } from "./draft";

type ListKey = "phones" | "emails" | "socialLinks";
/** Per list: the words, the keyboard, and the labels its sheet offers. */
const LISTS = {
  phones: { field: "contacts.form.phone", add: "contacts.form.addPhone", remove: "contacts.form.removePhone", sheet: "contacts.form.phoneLabel", labels: PHONE_LABELS, keyboard: "phone-pad", autoComplete: "tel", error: "phone" },
  emails: { field: "contacts.form.email", add: "contacts.form.addEmail", remove: "contacts.form.removeEmail", sheet: "contacts.form.emailLabel", labels: EMAIL_LABELS, keyboard: "email-address", autoComplete: "email", error: "email" },
  socialLinks: { field: "contacts.form.socialLink", add: "contacts.form.addSocial", remove: "contacts.form.removeSocial", sheet: "contacts.form.socialLabel", labels: SOCIAL_LABELS, keyboard: "url", autoComplete: "url", error: null },
} as const;

export type PhotoChange = { kind: "set"; uri: string; name: string; mimeType: string } | { kind: "remove" } | null;

function Section({ children, testID }: { children: ReactNode; testID?: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View testID={testID} style={{ backgroundColor: colors.surface, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: metrics.space.md, paddingVertical: metrics.space.xs, marginBottom: metrics.space.md }}>
      {children}
    </View>
  );
}

export function ContactForm({
  mode,
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
  saveError,
  photo,
  photoUrl,
  contactId,
  onPickPhoto,
  onRemovePhoto,
  notice,
}: {
  mode: "create" | "edit";
  draft: Draft;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  saveError: string | null;
  photo: PhotoChange;
  photoUrl: string | null;
  contactId: number;
  onPickPhoto: (from: "camera" | "library") => void;
  onRemovePhoto: () => void;
  /** Above the form, under the header: e.g. "already in your contacts". */
  notice?: ReactNode;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [tried, setTried] = useState(false);
  const [labelFor, setLabelFor] = useState<{ key: ListKey; index: number } | null>(null);
  const [picking, setPicking] = useState<"gender" | "closeness" | null>(null);
  const [tagText, setTagText] = useState("");
  const [photoSheet, setPhotoSheet] = useState(false);
  const [birthdayOpen, setBirthdayOpen] = useState(false);
  const found = tried ? problems(draft) : [];
  const thisYear = new Date().getFullYear();

  const save = () => {
    setTried(true);
    setBirthdayOpen(false);
    if (problems(draft).length === 0) onSave();
  };

  const field = { color: colors.ink, fontSize: 16, minHeight: metrics.touch, paddingVertical: metrics.space.sm, flex: 1 } as const;
  const divider = { height: 1, backgroundColor: colors.border } as const;
  const labelOf = (label: string) => t(`contacts.labels.${label}`, { defaultValue: label });

  const shownPhoto = photo?.kind === "set" ? photo.uri : photo?.kind === "remove" ? null : photoUrl;
  const preview = { id: contactId, firstname: draft.firstname, lastname: draft.lastname, nickname: null, company: draft.company || null, photoUrl: shownPhoto };

  const input = (props: {
    testID: string;
    value: string;
    onChangeText: (v: string) => void;
    label: string;
    keyboardType?: KeyboardTypeOptions;
    autoCapitalize?: "none" | "words" | "sentences";
    autoComplete?: "name-given" | "name-family" | "tel" | "email" | "organization" | "off" | "url";
    multiline?: boolean;
    autoFocus?: boolean;
  }) => (
    <TextInput
      testID={props.testID}
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.label}
      placeholderTextColor={colors.inkMuted}
      accessibilityLabel={props.label}
      keyboardType={props.keyboardType}
      autoCapitalize={props.autoCapitalize ?? "sentences"}
      autoComplete={props.autoComplete}
      autoCorrect={props.keyboardType ? false : undefined}
      multiline={props.multiline}
      autoFocus={props.autoFocus}
      maxLength={props.multiline ? 5000 : 200}
      onFocus={() => setBirthdayOpen(false)}
      style={{ ...field, ...(props.multiline ? { minHeight: 96, textAlignVertical: "top" as const } : null) }}
    />
  );

  const list = (key: ListKey) => {
    const spec = LISTS[key];
    return (
      <Section testID={`contact-form-${key}`}>
        {draft[key].map((entry, index) => {
          const bad = spec.error != null && found.includes(`${spec.error}:${index}`);
          return (
            <View key={index}>
              {index > 0 ? <View style={divider} /> : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
                <Pressable
                  testID={`contact-form-${key}-${index}-label`}
                  onPress={() => {
                    Keyboard.dismiss();
                    setLabelFor({ key, index });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t("contacts.form.labelOf", { label: labelOf(entry.label), field: t(spec.field) })}
                  style={{ minHeight: metrics.touch, minWidth: 72, justifyContent: "center" }}
                >
                  <Text tone="accent" variant="label" numberOfLines={1}>
                    {labelOf(entry.label)} ▾
                  </Text>
                </Pressable>
                {input({
                  testID: `contact-form-${key}-${index}`,
                  value: entry.value,
                  onChangeText: (value) => onChange(setEntry(draft, key, index, { value })),
                  label: t(spec.field),
                  keyboardType: spec.keyboard,
                  autoCapitalize: "none",
                  autoComplete: spec.autoComplete,
                })}
                <Pressable
                  testID={`contact-form-${key}-${index}-remove`}
                  onPress={() => onChange(removeEntry(draft, key, index))}
                  accessibilityRole="button"
                  accessibilityLabel={t(spec.remove, { value: entry.value || labelOf(entry.label) })}
                  hitSlop={4}
                  style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
                >
                  <X size={18} color={colors.inkMuted} />
                </Pressable>
              </View>
              {bad ? (
                <Text testID={`contact-form-${key}-${index}-error`} tone="danger" variant="caption" accessibilityLiveRegion="polite" style={{ paddingBottom: metrics.space.sm }}>
                  {spec.error === "phone" ? t("contacts.form.badPhone") : t("contacts.form.badEmail")}
                </Text>
              ) : null}
            </View>
          );
        })}
        {draft[key].length ? <View style={divider} /> : null}
        <Pressable
          testID={`contact-form-add-${key}`}
          onPress={() => onChange(addEntry(draft, key))}
          accessibilityRole="button"
          accessibilityLabel={t(spec.add)}
          style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch }}
        >
          <Plus size={18} color={colors.accent} />
          <Text tone="accent">{t(spec.add)}</Text>
        </Pressable>
      </Section>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: metrics.space.sm, gap: metrics.space.sm }}>
        <Pressable testID="contact-form-cancel" onPress={onCancel} accessibilityRole="button" accessibilityLabel={t("common.cancel")} hitSlop={8} style={{ minHeight: metrics.touch, justifyContent: "center" }}>
          <Text tone="accent">{t("common.cancel")}</Text>
        </Pressable>
        <Text variant="label" accessibilityRole="header" style={{ flex: 1, textAlign: "center" }} numberOfLines={1}>
          {mode === "create" ? t("contacts.form.newTitle") : t("contacts.form.editTitle")}
        </Text>
        <Pressable
          testID="contact-form-save"
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

      {saveError ? (
        <Text testID="contact-form-error" tone="danger" accessibilityLiveRegion="assertive" style={{ paddingBottom: metrics.space.sm }}>
          {`${t("contacts.form.notSaved")} ${saveError}`}
        </Text>
      ) : null}

      {notice}

      <ScrollView testID="contact-form" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: metrics.space.xl * 3 }}>
        <View style={{ alignItems: "center", paddingVertical: metrics.space.md }}>
          <Pressable
            testID="contact-form-photo"
            onPress={() => {
              Keyboard.dismiss();
              setPhotoSheet(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={shownPhoto ? t("contacts.form.changePhoto") : t("contacts.form.addPhoto")}
          >
            <ContactAvatar contact={preview} size={96} />
            <View style={{ position: "absolute", right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.ground }}>
              <Camera size={16} color={colors.onAccent} />
            </View>
          </Pressable>
        </View>

        <Section>
          {input({ testID: "contact-form-firstname", value: draft.firstname, onChangeText: (firstname) => onChange({ ...draft, firstname }), label: t("contacts.form.firstname"), autoCapitalize: "words", autoComplete: "name-given", autoFocus: mode === "create" })}
          <View style={divider} />
          {input({ testID: "contact-form-lastname", value: draft.lastname, onChangeText: (lastname) => onChange({ ...draft, lastname }), label: t("contacts.form.lastname"), autoCapitalize: "words", autoComplete: "name-family" })}
          <View style={divider} />
          {input({ testID: "contact-form-nickname", value: draft.nickname, onChangeText: (nickname) => onChange({ ...draft, nickname }), label: t("contacts.form.nickname"), autoCapitalize: "words" })}
          {found.includes("name") ? (
            <Text testID="contact-form-name-error" tone="danger" variant="caption" accessibilityLiveRegion="polite" style={{ paddingBottom: metrics.space.sm }}>
              {t("contacts.form.nameRequired")}
            </Text>
          ) : null}
        </Section>

        {list("phones")}
        {list("emails")}

        <Section>
          {input({ testID: "contact-form-company", value: draft.company, onChangeText: (company) => onChange({ ...draft, company }), label: t("contacts.form.company"), autoCapitalize: "words", autoComplete: "organization" })}
          <View style={divider} />
          {input({ testID: "contact-form-job", value: draft.jobTitle, onChangeText: (jobTitle) => onChange({ ...draft, jobTitle }), label: t("contacts.form.jobTitle"), autoCapitalize: "sentences" })}
        </Section>

        <Section testID="contact-form-birthday-section">
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
            <Cake size={18} color={colors.inkMuted} />
            <Pressable
              testID="contact-form-birthday"
              onPress={() => {
                Keyboard.dismiss();
                if (!draft.birthDate) onChange({ ...draft, birthDate: `${thisYear - 30}-01-01` });
                setBirthdayOpen((o) => !o || !draft.birthDate);
              }}
              accessibilityRole="button"
              accessibilityLabel={draft.birthDate ? t("contacts.form.birthdayValue", { date: draft.birthDate }) : t("contacts.form.addBirthday")}
              accessibilityState={{ expanded: birthdayOpen }}
              style={{ flex: 1, minHeight: metrics.touch, justifyContent: "center" }}
            >
              <Text tone={draft.birthDate ? "default" : "accent"}>
                {draft.birthDate ? new Date(`${draft.birthDate}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" }) : t("contacts.form.addBirthday")}
              </Text>
            </Pressable>
            {draft.birthDate ? (
              <Pressable
                testID="contact-form-birthday-clear"
                onPress={() => {
                  setBirthdayOpen(false);
                  onChange({ ...draft, birthDate: null });
                }}
                accessibilityRole="button"
                accessibilityLabel={t("contacts.form.clearBirthday")}
                style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
              >
                <X size={18} color={colors.inkMuted} />
              </Pressable>
            ) : null}
          </View>
          {birthdayOpen && draft.birthDate ? (
            <View style={{ paddingVertical: metrics.space.sm }}>
              <DateWheels testID="contact-form-birthday-wheels" value={draft.birthDate} onChange={(birthDate) => onChange({ ...draft, birthDate })} label={t("contacts.form.birthday")} maxYear={thisYear} />
              <Text variant="caption" tone="muted" style={{ paddingTop: metrics.space.xs }}>
                {t("contacts.form.birthdayYearNote")}
              </Text>
            </View>
          ) : null}
        </Section>

        {/* Gender turns "parent" into father or mother; closeness is how near
            this person is to you (web drawer, `ContactApp::Family` enums). */}
        <Section testID="contact-form-family-section">
          {(["gender", "closeness"] as const).map((which, i) => {
            const value = which === "gender" ? t(`contacts.genders.${draft.gender}`) : t(`contacts.closenessLevels.${draft.closeness}`);
            const label = which === "gender" ? t("contacts.form.gender") : t("contacts.form.closeness");
            return (
              <View key={which}>
                {i > 0 ? <View style={divider} /> : null}
                <Pressable
                  testID={`contact-form-${which}`}
                  onPress={() => {
                    Keyboard.dismiss();
                    setPicking(which);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}, ${value}`}
                  style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch }}
                >
                  {i === 0 ? <Users size={18} color={colors.inkMuted} /> : <View style={{ width: 18 }} />}
                  <Text style={{ flex: 1 }}>{label}</Text>
                  <Text tone="accent">{value} ▾</Text>
                </Pressable>
              </View>
            );
          })}
        </Section>

        {draft.addresses.map((a, index) => (
          <Section key={index} testID={`contact-form-address-${index}`}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
              <MapPin size={18} color={colors.inkMuted} />
              <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                {labelOf(a.label)}
              </Text>
              <Pressable testID={`contact-form-address-${index}-remove`} onPress={() => onChange({ ...draft, addresses: draft.addresses.filter((_, i) => i !== index) })} accessibilityRole="button" accessibilityLabel={t("contacts.form.removeAddress")} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
                <X size={18} color={colors.inkMuted} />
              </Pressable>
            </View>
            {input({ testID: `contact-form-address-${index}-street`, value: a.street, onChangeText: (street) => onChange(setAddress(draft, index, { street })), label: t("contacts.form.street") })}
            <View style={divider} />
            <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
              <View style={{ width: 96 }}>{input({ testID: `contact-form-address-${index}-postal`, value: a.postal, onChangeText: (postal) => onChange(setAddress(draft, index, { postal })), label: t("contacts.form.postal"), autoCapitalize: "none" })}</View>
              {input({ testID: `contact-form-address-${index}-city`, value: a.city, onChangeText: (city) => onChange(setAddress(draft, index, { city })), label: t("contacts.form.city"), autoCapitalize: "words" })}
            </View>
            <View style={divider} />
            {input({ testID: `contact-form-address-${index}-country`, value: a.country, onChangeText: (country) => onChange(setAddress(draft, index, { country })), label: t("contacts.form.country"), autoCapitalize: "words" })}
          </Section>
        ))}
        <Pressable
          testID="contact-form-add-address"
          onPress={() => onChange({ ...draft, addresses: [...draft.addresses, emptyAddress()] })}
          accessibilityRole="button"
          accessibilityLabel={t("contacts.form.addAddress")}
          style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch, marginBottom: metrics.space.md }}
        >
          <Plus size={18} color={colors.accent} />
          <Text tone="accent">{t("contacts.form.addAddress")}</Text>
        </Pressable>

        <Section>
          {input({ testID: "contact-form-website", value: draft.website, onChangeText: (website) => onChange({ ...draft, website }), label: t("contacts.form.website"), keyboardType: "url", autoCapitalize: "none", autoComplete: "url" })}
          <View style={divider} />
          {/* The web stores notes as Tiptap HTML: shown as rich text and edited
              in the Notes engine (app/rich-text.tsx), never as tags in a text
              box and never saved stripped (owner, 2026-11-15). */}
          <Pressable
            testID="contact-form-notes"
            onPress={() => {
              useRichTextSession.getState().start({
                html: draft.notes,
                title: t("contacts.form.notes"),
                onDone: (notes) => onChange({ ...draft, notes }),
              });
              router.push("/rich-text");
            }}
            accessibilityRole="button"
            accessibilityLabel={t("contacts.form.editNotes")}
            style={{ minHeight: 88, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, padding: metrics.space.md, backgroundColor: colors.surface }}
          >
            {draft.notes.trim() ? <RichText value={draft.notes} /> : <Text tone="muted">{t("contacts.form.notes")}</Text>}
          </Pressable>
        </Section>

        {list("socialLinks")}

        <Section testID="contact-form-tags">
          {draft.tags.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs, paddingTop: metrics.space.sm }}>
              {draft.tags.map((tag) => (
                <Pressable
                  key={tag}
                  testID={`contact-form-tag-${tag}-remove`}
                  onPress={() => onChange(removeTag(draft, tag))}
                  accessibilityRole="button"
                  accessibilityLabel={t("contacts.form.removeTag", { tag })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: metrics.space.sm }}
                >
                  <Text variant="caption" tone="accent">
                    {tag}
                  </Text>
                  <X size={14} color={colors.inkMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
            <TextInput
              testID="contact-form-tag-input"
              value={tagText}
              onChangeText={setTagText}
              onSubmitEditing={() => {
                onChange(addTag(draft, tagText));
                setTagText("");
              }}
              submitBehavior="submit"
              returnKeyType="done"
              placeholder={t("contacts.form.tags")}
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel={t("contacts.form.tags")}
              autoCapitalize="none"
              maxLength={60}
              onFocus={() => setBirthdayOpen(false)}
              style={field}
            />
            <Pressable
              testID="contact-form-tag-add"
              onPress={() => {
                onChange(addTag(draft, tagText));
                setTagText("");
              }}
              disabled={!tagText.trim()}
              accessibilityRole="button"
              accessibilityLabel={t("contacts.form.addTag")}
              accessibilityState={{ disabled: !tagText.trim() }}
              style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
            >
              <Plus size={18} color={tagText.trim() ? colors.accent : colors.inkMuted} />
            </Pressable>
          </View>
        </Section>

        <Section>
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch }}>
            <Star size={18} color={colors.inkMuted} />
            <Text style={{ flex: 1 }}>{t("contacts.form.favourite")}</Text>
            <Switch
              testID="contact-form-favourite"
              value={draft.favorite}
              onValueChange={(favorite) => onChange({ ...draft, favorite })}
              accessibilityLabel={t("contacts.form.favourite")}
              trackColor={{ true: colors.accent, false: colors.border }}
            />
          </View>
        </Section>
      </ScrollView>

      <ActionSheet
        open={labelFor != null}
        title={labelFor ? t(LISTS[labelFor.key].sheet) : ""}
        actions={(labelFor ? LISTS[labelFor.key].labels : []).map((label) => ({
          key: label,
          label: labelOf(label),
          onPress: () => labelFor && onChange(setEntry(draft, labelFor.key, labelFor.index, { label })),
        }))}
        onClose={() => setLabelFor(null)}
        testID="contact-form-label-sheet"
      />
      <ActionSheet
        open={picking === "gender"}
        title={t("contacts.form.gender")}
        actions={GENDERS.map((gender) => ({ key: gender, label: t(`contacts.genders.${gender}`), onPress: () => onChange({ ...draft, gender }) }))}
        onClose={() => setPicking(null)}
        testID="contact-form-gender-sheet"
      />
      <ActionSheet
        open={picking === "closeness"}
        title={t("contacts.form.closeness")}
        actions={CLOSENESS.map((closeness) => ({ key: closeness, label: t(`contacts.closenessLevels.${closeness}`), onPress: () => onChange({ ...draft, closeness }) }))}
        onClose={() => setPicking(null)}
        testID="contact-form-closeness-sheet"
      />
      <ActionSheet
        open={photoSheet}
        title={t("contacts.form.photoTitle")}
        actions={[
          { key: "camera", label: t("contacts.form.takePhoto"), onPress: () => onPickPhoto("camera") },
          { key: "library", label: t("contacts.form.choosePhoto"), onPress: () => onPickPhoto("library") },
          ...(shownPhoto ? [{ key: "remove", label: t("contacts.form.removePhoto"), danger: true, onPress: onRemovePhoto }] : []),
        ]}
        onClose={() => setPhotoSheet(false)}
        testID="contact-form-photo-sheet"
      />
    </View>
  );
}
