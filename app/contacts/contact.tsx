/**
 * One contact (`/contacts/contact?id=7`) — `docs/design/contacts/SPEC.md` §C.3.
 *
 * A contact card, not a form: big avatar, name, job · company, then four
 * round actions — Call · WhatsApp · Message · Email (WhatsApp's contact info,
 * Beside). An action with nothing to act on is shown disabled, not hidden
 * (Apple Messages), so the row never changes shape between two people.
 *
 * Then cards, label above value (Telegram): every phone (tap = call, its own
 * WhatsApp and message buttons, long press = copy), every email (tap = mail),
 * addresses (tap = maps), birthday, family, website, notes. Then rows: Share,
 * Save to phone contacts, Favourite, Ask the assistant, Delete — the
 * destructive one last, alone, in red (WhatsApp).
 */
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import {
  BookUser, Briefcase, Cake, ChevronLeft, Globe, Mail, MapPin, MessageCircle, MessageSquareText, NotebookPen,
  Pencil, Phone, Plus, Share2, Star, StarOff, Trash2, Users, X,
} from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useDraft } from "@/hooks/useDraft";
import { aiApi } from "@/api/ai";
import { contactsApi, displayName, RELATION_KINDS, type Contact, type RelationKind } from "@/api/contacts";
import { failureMessage } from "@/api/failure";
import { ContactAvatar } from "@/screens/contacts/ContactAvatar";
import { ActionSheet } from "@/screens/contacts/ActionSheet";
import { useContactActions, type Channel } from "@/screens/contacts/useContactActions";
import { addressText, mapsUrl, openOutside } from "@/screens/contacts/outside";
import { birthdayInfo } from "@/screens/contacts/birthday";
import { phoneBook, PhoneBookUnavailable } from "@/screens/contacts/phoneBook";
import { sortKey } from "@/screens/contacts/sections";
import { dayKey } from "@/screens/calendar/dates";
import { useContactsUndo } from "@/stores/contactsUndo.store";

/** WhatsApp's own green, for its button only: people find it by colour. */
const WHATSAPP = "#1FAF54";

function parseId(raw: string | undefined): number | null {
  return raw && /^\d+$/.test(raw) ? Number(raw) : null;
}

export default function ContactDetail() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string }>();
  const contactId = parseId(params.id);

  const query = useQuery({
    queryKey: ["contacts", "contact", contactId ?? 0],
    queryFn: () => contactsApi.show(contactId ?? 0),
    enabled: contactId != null,
    // The row the list already holds draws the header at once; the full view
    // (addresses, notes, family) replaces it a moment later.
    placeholderData: () => (queryClient.getQueryData<Contact[]>(["contacts", "list"]) ?? []).find((c) => c.id === contactId),
  });
  const contact = query.data;
  const actions = useContactActions(contact);
  const { data: sessionId } = useQuery({ queryKey: ["ai", "currentSession"], queryFn: aiApi.currentSessionId });
  const { setDraft } = useDraft(sessionId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [familyOpen, setFamilyOpen] = useState<null | "kind" | RelationKind>(null);
  // The whole book, only once "Add" is tapped: the detail can be opened from a
  // birthday or the assistant with no list screen (and no list cache) below it.
  const book = useQuery({ queryKey: ["contacts", "list"], queryFn: contactsApi.list, enabled: familyOpen != null });

  const reload = () => void queryClient.invalidateQueries({ queryKey: ["contacts"] });

  const favourite = useMutation({
    mutationFn: (c: Contact) => contactsApi.setFavorite(c.id, !c.favorite),
    onSuccess: (saved) => {
      queryClient.setQueryData(["contacts", "contact", saved.id], (old: Contact | undefined) => ({ ...(old ?? saved), favorite: saved.favorite }));
      reload();
    },
    onError: (e) => setError(failureMessage(e, t("contacts.detail.saveFailed"))),
  });

  const setTrashed = useContactsUndo((s) => s.set);
  const remove = useMutation({
    mutationFn: (c: Contact) => contactsApi.remove(c.id),
    onSuccess: (_void, c) => {
      setTrashed({ id: c.id, name: displayName(c), at: Date.now() });
      reload();
      router.back();
    },
    onError: (e) => setError(failureMessage(e, t("contacts.detail.deleteFailed"))),
  });

  const unlink = useMutation({
    mutationFn: ({ relationId }: { relationId: number }) => contactsApi.removeRelation(contactId ?? 0, relationId),
    onSuccess: reload,
    onError: (e) => setError(failureMessage(e, t("contacts.family.failed"))),
  });
  const link = useMutation({
    mutationFn: ({ relativeId, kind }: { relativeId: number; kind: RelationKind }) => contactsApi.addRelation(contactId ?? 0, relativeId, kind),
    onSuccess: reload,
    onError: (e) => setError(failureMessage(e, t("contacts.family.failed"))),
  });

  if (contactId == null || (!contact && query.error)) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: metrics.space.md }}>
          <Text testID="contact-load-failed" tone="muted" style={{ textAlign: "center" }}>
            {failureMessage(query.error, t("contacts.detail.loadFailed"))}
          </Text>
          <Button label={t("common.tryAgain")} block={false} onPress={() => void query.refetch()} />
          <Button label={t("common.back")} tone="neutral" block={false} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }
  if (!contact) {
    return (
      <Screen>
        <ActivityIndicator testID="contact-loading" style={{ marginTop: 64 }} />
      </Screen>
    );
  }

  const name = displayName(contact) || t("contacts.noName");
  const role = [contact.jobTitle, contact.company].filter(Boolean).join(" · ");
  const birthday = birthdayInfo(contact.birthDate, dayKey(new Date()));
  const copy = (value: string) => {
    void Clipboard.setStringAsync(value);
    setError(null);
    Alert.alert(t("contacts.detail.copied", { value }));
  };

  const confirmDelete = () =>
    Alert.alert(t("contacts.detail.deleteTitle", { name }), t("contacts.detail.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => remove.mutate(contact) },
    ]);

  const ask = () => {
    setDraft(t("contacts.detail.question", { name }));
    router.push("/chat");
  };

  const saveToPhone = async () => {
    setError(null);
    try {
      if ((await phoneBook.requestAccess()) === "denied") {
        setError(t("contacts.phone.denied"));
        return;
      }
      await phoneBook.saveToPhone(contact);
    } catch (e) {
      setError(e instanceof PhoneBookUnavailable ? t("contacts.phone.unavailable") : failureMessage(e, t("contacts.phone.saveFailed")));
    }
  };

  const quick: { channel: Channel; label: string; icon: ReactNode; on: boolean; tint: string }[] = [
    { channel: "call", label: t("contacts.actions.call"), icon: <Phone size={22} color={actions.has.call ? colors.onAccent : colors.inkMuted} />, on: actions.has.call, tint: colors.accent },
    { channel: "whatsapp", label: t("contacts.actions.whatsapp"), icon: <MessageCircle size={22} color={actions.has.whatsapp ? "#FFFFFF" : colors.inkMuted} />, on: actions.has.whatsapp, tint: WHATSAPP },
    { channel: "sms", label: t("contacts.actions.sms"), icon: <MessageSquareText size={22} color={actions.has.sms ? colors.onAccent : colors.inkMuted} />, on: actions.has.sms, tint: colors.accent },
    { channel: "email", label: t("contacts.actions.email"), icon: <Mail size={22} color={actions.has.email ? colors.onAccent : colors.inkMuted} />, on: actions.has.email, tint: colors.accent },
  ];

  // Everyone else in the book, for "add a family member".
  const others = (book.data ?? [])
    .filter((c) => c.id !== contact.id && !contact.relations.some((r) => r.relative.id === c.id))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: metrics.space.md, gap: metrics.space.sm }}>
        <Pressable testID="contact-back" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={8} style={{ width: 32, height: 32, justifyContent: "center" }}>
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          testID="contact-favourite"
          onPress={() => favourite.mutate(contact)}
          disabled={favourite.isPending}
          accessibilityRole="button"
          accessibilityLabel={contact.favorite ? t("contacts.actions.unfavourite") : t("contacts.actions.favourite")}
          accessibilityState={{ selected: contact.favorite }}
          hitSlop={6}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
        >
          <Star size={22} color={contact.favorite ? colors.accent : colors.ink} fill={contact.favorite ? colors.accent : "transparent"} />
        </Pressable>
        <Pressable
          testID="contact-edit"
          onPress={() => router.push({ pathname: "/contacts/edit", params: { id: String(contact.id) } })}
          accessibilityRole="button"
          accessibilityLabel={t("contacts.detail.edit")}
          hitSlop={6}
          style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: metrics.space.sm }}
        >
          <Pencil size={18} color={colors.accent} />
          <Text tone="accent" variant="label">
            {t("contacts.detail.edit")}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 48, gap: metrics.space.lg }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: "center", gap: metrics.space.sm }}>
          <ContactAvatar contact={contact} size={104} testID="contact-avatar" />
          <Text testID="contact-name" variant="title" accessibilityRole="header" style={{ textAlign: "center" }}>
            {name}
          </Text>
          {contact.nickname ? (
            <Text tone="muted" style={{ textAlign: "center" }}>
              “{contact.nickname}”
            </Text>
          ) : null}
          {role ? (
            <Text testID="contact-role" tone="muted" style={{ textAlign: "center" }}>
              {role}
            </Text>
          ) : null}
        </View>

        <View testID="contact-quick-actions" style={{ flexDirection: "row", justifyContent: "center", gap: metrics.space.lg }}>
          {quick.map((q) => (
            <Pressable
              key={q.channel}
              testID={`contact-quick-${q.channel}`}
              onPress={() => actions.act(q.channel)}
              disabled={!q.on}
              accessibilityRole="button"
              accessibilityLabel={q.label}
              accessibilityState={{ disabled: !q.on }}
              style={{ alignItems: "center", gap: 6, width: 64 }}
            >
              <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: q.on ? q.tint : colors.surface, borderWidth: q.on ? 0 : 1, borderColor: colors.border }}>
                {q.icon}
              </View>
              <Text variant="caption" tone={q.on ? "default" : "muted"} numberOfLines={1}>
                {q.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {error || actions.error ? (
          <Text testID="contact-error" tone="danger" style={{ textAlign: "center" }}>
            {error ?? actions.error}
          </Text>
        ) : null}

        {contact.phones.length ? (
          <Card>
            {contact.phones.map((p, i) => (
              <Row key={`p${i}`} testID={`contact-phone-${i}`} label={actions.labelOf(p.label)} value={p.value} first={i === 0} onPress={() => actions.act("call", p)} onLongPress={() => copy(p.value)} a11yHint={t("contacts.detail.phoneHint")}>
                <IconButton testID={`contact-phone-${i}-whatsapp`} label={t("contacts.detail.whatsappTo", { number: p.value })} onPress={() => actions.act("whatsapp", p)}>
                  <MessageCircle size={20} color={WHATSAPP} />
                </IconButton>
                <IconButton testID={`contact-phone-${i}-sms`} label={t("contacts.detail.smsTo", { number: p.value })} onPress={() => actions.act("sms", p)}>
                  <MessageSquareText size={20} color={colors.accent} />
                </IconButton>
              </Row>
            ))}
          </Card>
        ) : null}

        {contact.emails.length ? (
          <Card>
            {contact.emails.map((e, i) => (
              <Row key={`e${i}`} testID={`contact-email-${i}`} label={actions.labelOf(e.label)} value={e.value} first={i === 0} onPress={() => actions.act("email", e)} onLongPress={() => copy(e.value)} a11yHint={t("contacts.detail.emailHint")}>
                <Mail size={18} color={colors.inkMuted} />
              </Row>
            ))}
          </Card>
        ) : null}

        {contact.addresses.length ? (
          <Card>
            {contact.addresses.map((a, i) => (
              <Row
                key={`a${i}`}
                testID={`contact-address-${i}`}
                label={actions.labelOf(a.label)}
                value={addressText(a)}
                first={i === 0}
                onPress={() => void openOutside(mapsUrl(addressText(a)), { t, fail: t("contacts.outside.noMaps"), copy: addressText(a) })}
                onLongPress={() => copy(addressText(a))}
                a11yHint={t("contacts.detail.addressHint")}
              >
                <MapPin size={18} color={colors.inkMuted} />
              </Row>
            ))}
          </Card>
        ) : null}

        {contact.birthDate || contact.website || contact.company ? (
          <Card>
            {contact.birthDate ? (
              <Info
                first
                testID="contact-birthday"
                icon={<Cake size={18} color={colors.inkMuted} />}
                label={t("contacts.detail.birthday")}
                value={[
                  new Date(`${contact.birthDate}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" }),
                  contact.age != null ? t("contacts.detail.age", { count: contact.age }) : null,
                  birthday ? (birthday.inDays === 0 ? t("contacts.birthdays.today") : t("contacts.birthdays.inDays", { count: birthday.inDays })) : null,
                ].filter(Boolean).join(" · ")}
              />
            ) : null}
            {contact.company ? <Info first={!contact.birthDate} testID="contact-company" icon={<Briefcase size={18} color={colors.inkMuted} />} label={t("contacts.detail.work")} value={role} /> : null}
            {contact.website ? (
              <Row
                first={!contact.birthDate && !contact.company}
                testID="contact-website"
                label={t("contacts.detail.website")}
                value={contact.website}
                onPress={() => void openOutside(/^https?:\/\//i.test(contact.website ?? "") ? (contact.website ?? "") : `https://${contact.website}`, { t, fail: t("contacts.outside.noBrowser"), copy: contact.website ?? "" })}
                onLongPress={() => copy(contact.website ?? "")}
              >
                <Globe size={18} color={colors.inkMuted} />
              </Row>
            ) : null}
          </Card>
        ) : null}

        <View style={{ gap: metrics.space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text variant="label" tone="muted" accessibilityRole="header" style={{ flex: 1 }}>
              {t("contacts.family.title")}
            </Text>
            <Pressable testID="contact-family-add" onPress={() => setFamilyOpen("kind")} accessibilityRole="button" accessibilityLabel={t("contacts.family.add")} hitSlop={6} style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Plus size={16} color={colors.accent} />
              <Text variant="label" tone="accent">
                {t("contacts.family.add")}
              </Text>
            </Pressable>
          </View>
          {contact.relations.length ? (
            <Card>
              {contact.relations.map((r, i) => (
                <Row
                  key={r.id}
                  first={i === 0}
                  testID={`contact-relation-${r.id}`}
                  label={t(`contacts.family.kinds.${r.kind}`, { defaultValue: r.label })}
                  value={r.relative.name}
                  onPress={() => router.push({ pathname: "/contacts/contact", params: { id: String(r.relative.id) } })}
                  a11yHint={t("contacts.family.openHint")}
                >
                  <IconButton testID={`contact-relation-${r.id}-remove`} label={t("contacts.family.remove", { name: r.relative.name })} onPress={() => unlink.mutate({ relationId: r.id })}>
                    <X size={18} color={colors.inkMuted} />
                  </IconButton>
                </Row>
              ))}
            </Card>
          ) : (
            <Text testID="contact-family-none" tone="muted" variant="caption">
              {t("contacts.family.none")}
            </Text>
          )}
        </View>

        {contact.notes ? (
          <Card>
            <Pressable
              testID="contact-notes-box"
              onLongPress={() => copy(contact.notes ?? "")}
              accessibilityHint={t("contacts.detail.notesHint")}
              style={{ padding: metrics.space.md, gap: 4 }}
            >
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <NotebookPen size={16} color={colors.inkMuted} />
                <Text variant="caption" tone="muted">
                  {t("contacts.detail.notes")}
                </Text>
              </View>
              <Text testID="contact-notes">{contact.notes}</Text>
            </Pressable>
          </Card>
        ) : null}

        {contact.documentsCount ? (
          <Text testID="contact-documents" variant="caption" tone="muted">
            {t("contacts.detail.documents", { count: contact.documentsCount })}
          </Text>
        ) : null}

        <View style={{ gap: metrics.space.sm }}>
          <ActionRow testID="contact-share" icon={actions.sharing ? <ActivityIndicator /> : <Share2 size={20} color={colors.ink} />} label={t("contacts.actions.share")} disabled={actions.sharing} onPress={() => void actions.share()} />
          <ActionRow testID="contact-save-to-phone" icon={<BookUser size={20} color={colors.ink} />} label={t("contacts.detail.saveToPhone")} onPress={() => void saveToPhone()} />
          <ActionRow testID="contact-favourite-row" icon={contact.favorite ? <StarOff size={20} color={colors.ink} /> : <Star size={20} color={colors.ink} />} label={contact.favorite ? t("contacts.actions.unfavourite") : t("contacts.actions.favourite")} onPress={() => favourite.mutate(contact)} />
          <ActionRow testID="contact-ask" icon={<Users size={20} color={colors.ink} />} label={t("contacts.detail.ask")} onPress={ask} />
          <ActionRow testID="contact-delete" icon={remove.isPending ? <ActivityIndicator color={colors.danger} /> : <Trash2 size={20} color={colors.danger} />} label={t("common.delete")} danger disabled={remove.isPending} onPress={confirmDelete} />
        </View>
      </ScrollView>

      <ActionSheet
        open={familyOpen === "kind"}
        title={t("contacts.family.whichKind", { name })}
        actions={RELATION_KINDS.map((k) => ({ key: k, label: t(`contacts.family.kinds.${k}`), onPress: () => setFamilyOpen(k) }))}
        onClose={() => setFamilyOpen((v) => (v === "kind" ? null : v))}
        testID="contact-family-kind"
      />
      <ActionSheet
        open={familyOpen != null && familyOpen !== "kind"}
        title={familyOpen && familyOpen !== "kind" ? t("contacts.family.whoIs", { kind: t(`contacts.family.kinds.${familyOpen}`), name }) : ""}
        subtitle={book.isLoading ? t("contacts.list.searching") : others.length ? undefined : t("contacts.family.nobody")}
        actions={others.map((c) => ({
          key: String(c.id),
          label: displayName(c) || t("contacts.noName"),
          onPress: () => familyOpen && familyOpen !== "kind" && link.mutate({ relativeId: c.id, kind: familyOpen }),
        }))}
        onClose={() => setFamilyOpen(null)}
        testID="contact-family-who"
      />
      {actions.element}
    </Screen>
  );
}

function Card({ children }: { children: ReactNode }) {
  const colors = useColors();
  const metrics = useMetrics();
  return <View style={{ borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>{children}</View>;
}

function Divider({ show }: { show: boolean }) {
  const colors = useColors();
  return show ? <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 16 }} /> : null;
}

/** Label above value, the value in the accent because it does something. */
function Row({
  label, value, onPress, onLongPress, first, testID, a11yHint, children,
}: {
  label: string; value: string; onPress: () => void; onLongPress?: () => void; first?: boolean; testID: string; a11yHint?: string; children?: ReactNode;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <>
      <Divider show={!first} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingRight: metrics.space.sm }}>
        <Pressable
          testID={testID}
          onPress={onPress}
          onLongPress={onLongPress}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${value}`}
          accessibilityHint={a11yHint}
          android_ripple={{ color: colors.border }}
          style={{ flex: 1, minHeight: 60, justifyContent: "center", paddingHorizontal: metrics.space.md, paddingVertical: metrics.space.sm }}
        >
          <Text variant="caption" tone="muted">
            {label}
          </Text>
          <Text tone="accent">
            {value}
          </Text>
        </Pressable>
        {children}
      </View>
    </>
  );
}

function Info({ label, value, icon, first, testID }: { label: string; value: string; icon: ReactNode; first?: boolean; testID: string }) {
  const metrics = useMetrics();
  return (
    <>
      <Divider show={!first} />
      <View testID={testID} accessible accessibilityLabel={`${label}, ${value}`} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 60, paddingHorizontal: metrics.space.md, paddingVertical: metrics.space.sm }}>
        {icon}
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="muted">
            {label}
          </Text>
          <Text>{value}</Text>
        </View>
      </View>
    </>
  );
}

function IconButton({ label, onPress, testID, children }: { label: string; onPress: () => void; testID: string; children: ReactNode }) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
      {children}
    </Pressable>
  );
}

function ActionRow({ icon, label, onPress, danger, disabled, testID }: { icon: ReactNode; label: string; onPress: () => void; danger?: boolean; disabled?: boolean; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      android_ripple={{ color: colors.border }}
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: metrics.touch + 4, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border }}
    >
      {icon}
      <Text tone={danger ? "danger" : "default"}>{label}</Text>
    </Pressable>
  );
}
