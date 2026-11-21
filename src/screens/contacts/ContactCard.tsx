/**
 * One contact's card — `docs/design/contacts/SPEC.md` §C.3. Drawn by its own
 * route on a phone (`app/contacts/contact.tsx`) and, `embedded`, as the right
 * pane of the tablet split (`app/contacts/index.tsx`, SPEC §C.11): there it
 * draws no shared header (the split screen has one), and a delete clears the
 * selection instead of going back.
 *
 * A contact card, not a form: big avatar, name, job · company, then four
 * round actions — Call · WhatsApp · Message · Email (WhatsApp's contact info,
 * Beside). An action with nothing to act on is shown disabled, not hidden
 * (Apple Messages), so the row never changes shape between two people.
 *
 * Then cards, label above value (Telegram): every phone (tap = call, its own
 * WhatsApp and message buttons, long press = copy), every email (tap = mail),
 * addresses (tap = maps), birthday, website, social links, tags, family,
 * notes, documents (`ContactDocuments.tsx`). Then rows: Share, Save to phone
 * contacts, Favourite, This is me, Ask the assistant, Delete — the
 * destructive one last, alone, in red (WhatsApp).
 *
 * Family follows the web's drawer (`FamilySection`, `AddFamilyMemberModal`,
 * 6de97a32): each tie in its own words (`family.ts`), a pencil to change its
 * role or its kind (step, half, adoptive), and Add = a role, the kind of tie,
 * then someone from the book or a new person. "Mother — Sara's family" puts
 * the tie on the spouse, as the web's in-law buttons do.
 */
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useNav } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import {
  BookUser, Briefcase, Cake, CircleCheck, ExternalLink, Globe, List, Mail, MapPin, MessageCircle, MessageSquareText, NotebookPen,
  Pencil, Phone, Plus, Share2, Star, StarOff, Trash2, Users, X,
} from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { RichText } from "@/components/RichText";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useDraft } from "@/hooks/useDraft";
import { aiApi } from "@/api/ai";
import { contactsApi, displayName, type Contact, type Qualifier, type Relation } from "@/api/contacts";
import { failureMessage } from "@/api/failure";
import { htmlToPlainText } from "@/lib/richText";
import { ContactAvatar } from "@/screens/contacts/ContactAvatar";
import { ContactDocuments } from "@/screens/contacts/ContactDocuments";
import { ActionSheet } from "@/screens/contacts/ActionSheet";
import { useContactActions, type Channel } from "@/screens/contacts/useContactActions";
import { addressText, mapsUrl, openOutside } from "@/screens/contacts/outside";
import { birthdayInfo } from "@/screens/contacts/birthday";
import { phoneBook, PhoneBookUnavailable } from "@/screens/contacts/phoneBook";
import { sortKey } from "@/screens/contacts/sections";
import { dayKey } from "@/screens/calendar/dates";
import { aiKeys, contactsKeys } from "@/api/keys";
import { useChangeRelation, useFavourite, useLinkRelative, useSetSelf, useTrashContact, useUnlinkRelative } from "@/screens/contacts/useContactMutations";
import { ALL_ROLES, FAMILY_ROLES, groupRelations, IN_LAW_ROLES, OTHER_ROLES, qualifiersFor, relationWord, roleLabel, type Role } from "@/screens/contacts/family";
import { NameDialog } from "@/screens/pages/ItemSheet";
import { SHEET_CLOSE_MS } from "@/screens/pages/drive/sheets";

/** WhatsApp's own green, for its button only: people find it by colour. */
const WHATSAPP = "#1FAF54";

/** After a sheet has slid away: iOS will not present a second Modal over one
 *  still leaving (`ContactDocuments.tsx` waits the same). */
const afterSheet = (fn: () => void) => setTimeout(fn, SHEET_CLOSE_MS);

/** A tie being added: who it goes on (the card, or a spouse for an in-law),
 *  the role, then the kind of tie. */
type Adding = { anchorId: number; anchorName: string; role: Role; qualifier: Qualifier };
const cap = (w: string) => w.charAt(0).toLocaleUpperCase() + w.slice(1);
const withScheme = (url: string) => (/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);

/** The phone's full screen, under the shared header; or the split's right
 *  pane, which has no header of its own (the split screen already draws one). */
function Frame({ embedded, title, children }: { embedded: boolean; title?: string; children: ReactNode }) {
  if (embedded) return <View style={{ flex: 1 }}>{children}</View>;
  return (
    <Screen>
      <AppHeader app="contacts" title={title} back />
      {children}
    </Screen>
  );
}

export function ContactCard({
  contactId,
  embedded = false,
  onGone,
}: {
  contactId: number | null;
  /** The tablet split's right pane: no back button. */
  embedded?: boolean;
  /** Embedded only: the contact was deleted, so drop the selection. */
  onGone?: () => void;
}) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: contactsKeys.detail(contactId ?? 0),
    queryFn: () => contactsApi.show(contactId ?? 0),
    enabled: contactId != null,
    // The row the list already holds draws the header at once; the full view
    // (addresses, notes, family) replaces it a moment later.
    placeholderData: () => (queryClient.getQueryData<Contact[]>(contactsKeys.list()) ?? []).find((c) => c.id === contactId),
  });
  const contact = query.data;
  const actions = useContactActions(contact);
  const { data: sessionId } = useQuery({ queryKey: aiKeys.currentSession(), queryFn: aiApi.currentSessionId });
  const { setDraft } = useDraft(sessionId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [rolePicking, setRolePicking] = useState(false);
  const [adding, setAdding] = useState<{ step: "qualifier" | "who" | "name"; tie: Adding } | null>(null);
  // The "who is it?" list's search (old audit P2): a long book is not scrolled by hand.
  const [whoTyped, setWhoTyped] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ step: "menu" | "role" | "qualifier"; relation: Relation } | null>(null);
  // The whole book, only once "Add" is tapped: the detail can be opened from a
  // birthday or the assistant with no list screen (and no list cache) below it.
  const book = useQuery({ queryKey: contactsKeys.list(), queryFn: contactsApi.list, enabled: rolePicking || adding != null });

  const favourite = useFavourite({ onError: (e) => setError(failureMessage(e, t("contacts.detail.saveFailed"))) });
  const remove = useTrashContact({
    // In the tablet split the card is a pane: the list stays, the pane empties.
    onDone: () => (embedded ? onGone?.() : router.back()),
    onError: (e) => setError(failureMessage(e, t("contacts.detail.deleteFailed"))),
  });
  const familyFailed = (e: unknown) => setError(failureMessage(e, t("contacts.family.failed")));
  const unlink = useUnlinkRelative(contactId ?? 0, { onError: familyFailed });
  const link = useLinkRelative(contactId ?? 0, { onError: familyFailed });
  const change = useChangeRelation(contactId ?? 0, { onError: familyFailed });
  const setSelf = useSetSelf({ onError: (e) => setError(failureMessage(e, t("contacts.family.self.failed"))) });

  if (contactId == null || (!contact && query.error)) {
    return (
      <Frame embedded={embedded}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: metrics.space.md }}>
          <Text testID="contact-load-failed" tone="muted" style={{ textAlign: "center" }}>
            {failureMessage(query.error, t("contacts.detail.loadFailed"))}
          </Text>
          <Button label={t("common.tryAgain")} block={false} onPress={() => void query.refetch()} />
        </View>
      </Frame>
    );
  }
  if (!contact) {
    return (
      <Frame embedded={embedded}>
        <ActivityIndicator testID="contact-loading" style={{ marginTop: 64 }} />
      </Frame>
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
  const anchorId = adding?.tie.anchorId ?? contact.id;
  const whoTerm = whoTyped.trim().toLocaleLowerCase();
  const others = (book.data ?? [])
    .filter((c) => c.id !== contact.id && c.id !== anchorId && (anchorId !== contact.id || !contact.relations.some((r) => r.relative.id === c.id)))
    .filter((c) => !whoTerm || displayName(c).toLocaleLowerCase().includes(whoTerm))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  // A current spouse is the door into the other family (web `viaFamily`).
  const spouses = contact.relations.filter((r) => r.kind === "spouse" && r.status === "current").map((r) => r.relative);

  const pickRole = (role: Role, anchor: { id: number; name: string }) => {
    const tie: Adding = { anchorId: anchor.id, anchorName: anchor.name, role, qualifier: "biological" };
    afterSheet(() => setAdding({ step: qualifiersFor(role.kind).length ? "qualifier" : "who", tie }));
  };
  const linkTo = (tie: Adding, relative: Contact) =>
    link.mutate({
      anchorId: tie.anchorId,
      tie: { relativeId: relative.id, kind: tie.role.kind, qualifier: tie.qualifier },
      // "Father" says he is a man; his card may not have said so yet.
      fillGender: tie.role.gender && relative.gender === "unknown" ? { id: relative.id, gender: tie.role.gender } : undefined,
    });
  const createAndLink = (tie: Adding, name: string) => {
    const [firstname, ...rest] = name.trim().split(/\s+/);
    setNameError(null);
    link.mutate(
      { anchorId: tie.anchorId, tie: { relative: { firstname, lastname: rest.join(" "), gender: tie.role.gender ?? undefined }, kind: tie.role.kind, qualifier: tie.qualifier } },
      { onSuccess: () => setAdding(null), onError: (e) => setNameError(failureMessage(e, t("contacts.family.failed"))) },
    );
  };

  const toggleSelf = () => {
    if (contact.isSelf) {
      setSelf.mutate({ id: contact.id, isSelf: false });
      return;
    }
    Alert.alert(t("contacts.family.self.confirmTitle", { name }), t("contacts.family.self.confirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("contacts.family.self.yes"), onPress: () => setSelf.mutate({ id: contact.id, isSelf: true }) },
    ]);
  };

  return (
    <Frame embedded={embedded} title={name}>
      {/* The card's own row (under the shared header on a phone): favourite and edit. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", paddingVertical: embedded ? metrics.space.md : metrics.space.xs, gap: metrics.space.sm }}>
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
          {contact.isSelf || contact.closeness !== "unset" ? (
            <View style={{ flexDirection: "row", gap: metrics.space.xs, flexWrap: "wrap", justifyContent: "center" }}>
              {contact.isSelf ? <Chip testID="contact-self" label={t("contacts.family.self.badge")} /> : null}
              {contact.closeness !== "unset" ? (
                <Chip
                  testID="contact-closeness"
                  label={t(`contacts.closenessLevels.${contact.closeness}`)}
                  a11yLabel={t("contacts.detail.closeness", { level: t(`contacts.closenessLevels.${contact.closeness}`) })}
                />
              ) : null}
            </View>
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

        {contact.socialLinks.length ? (
          <Card>
            {contact.socialLinks.map((l, i) => (
              <Row
                key={`s${i}`}
                testID={`contact-social-${i}`}
                label={actions.labelOf(l.label)}
                value={l.value}
                first={i === 0}
                onPress={() => void openOutside(withScheme(l.value), { t, fail: t("contacts.outside.noBrowser"), copy: l.value })}
                onLongPress={() => copy(l.value)}
                a11yHint={t("contacts.detail.linkHint")}
              >
                <ExternalLink size={18} color={colors.inkMuted} />
              </Row>
            ))}
          </Card>
        ) : null}

        {contact.tags.length ? (
          <View testID="contact-tags" accessible accessibilityLabel={`${t("contacts.detail.tags")}: ${contact.tags.join(", ")}`} style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
            {contact.tags.map((tag) => (
              <Chip key={tag} label={tag} />
            ))}
          </View>
        ) : null}

        <View style={{ gap: metrics.space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md }}>
            <Text variant="label" tone="muted" accessibilityRole="header" style={{ flex: 1 }}>
              {t("contacts.family.title")}
            </Text>
            {contact.relations.length ? (
              <Pressable testID="contact-family-tree" onPress={() => router.push({ pathname: "/contacts/family", params: { id: String(contact.id) } })} accessibilityRole="button" accessibilityLabel={t("contacts.family.tree")} hitSlop={6} style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <List size={16} color={colors.accent} />
                <Text variant="label" tone="accent">
                  {t("contacts.family.tree")}
                </Text>
              </Pressable>
            ) : null}
            <Pressable testID="contact-family-add" onPress={() => setRolePicking(true)} accessibilityRole="button" accessibilityLabel={t("contacts.family.add")} hitSlop={6} style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Plus size={16} color={colors.accent} />
              <Text variant="label" tone="accent">
                {t("contacts.family.add")}
              </Text>
            </Pressable>
          </View>
          {contact.relations.length ? (
            <Card>
              {groupRelations(contact.relations).map((r, i) => (
                <Row
                  key={r.id}
                  first={i === 0}
                  testID={`contact-relation-${r.id}`}
                  label={[
                    relationWord(t, r),
                    r.relative.age != null ? t("contacts.detail.age", { count: r.relative.age }) : null,
                    r.relative.deceased ? t("contacts.family.deceased") : null,
                  ].filter(Boolean).join(" · ")}
                  value={r.relative.isSelf ? `${r.relative.name} (${t("contacts.family.you")})` : r.relative.name}
                  onPress={() => router.push({ pathname: "/contacts/contact", params: { id: String(r.relative.id) } })}
                  a11yHint={t("contacts.family.openHint")}
                >
                  {/* Always there: a mistake you cannot see how to fix is a bug (web FamilySection). */}
                  <IconButton testID={`contact-relation-${r.id}-edit`} label={t("contacts.family.edit", { name: r.relative.name })} onPress={() => setEditing({ step: "menu", relation: r })}>
                    <Pencil size={18} color={colors.inkMuted} />
                  </IconButton>
                  <IconButton testID={`contact-relation-${r.id}-remove`} label={t("contacts.family.remove", { name: r.relative.name })} onPress={() => unlink.mutate(r.id)}>
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
              onLongPress={() => copy(htmlToPlainText(contact.notes ?? ""))}
              accessibilityHint={t("contacts.detail.notesHint")}
              style={{ padding: metrics.space.md, gap: 4 }}
            >
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <NotebookPen size={16} color={colors.inkMuted} />
                <Text variant="caption" tone="muted">
                  {t("contacts.detail.notes")}
                </Text>
              </View>
              {/* The web stores notes as Tiptap HTML: drawn like a note, never as tags. */}
              <RichText testID="contact-notes" value={contact.notes} />
            </Pressable>
          </Card>
        ) : null}

        <ContactDocuments contactId={contact.id} documents={contact.documents} />

        <View style={{ gap: metrics.space.sm }}>
          <ActionRow testID="contact-share" icon={actions.sharing ? <ActivityIndicator /> : <Share2 size={20} color={colors.ink} />} label={t("contacts.actions.share")} disabled={actions.sharing} onPress={() => void actions.share()} />
          <ActionRow testID="contact-save-to-phone" icon={<BookUser size={20} color={colors.ink} />} label={t("contacts.detail.saveToPhone")} onPress={() => void saveToPhone()} />
          <ActionRow testID="contact-favourite-row" icon={contact.favorite ? <StarOff size={20} color={colors.ink} /> : <Star size={20} color={colors.ink} />} label={contact.favorite ? t("contacts.actions.unfavourite") : t("contacts.actions.favourite")} onPress={() => favourite.mutate(contact)} />
          <ActionRow testID="contact-self-toggle" icon={setSelf.isPending ? <ActivityIndicator /> : <CircleCheck size={20} color={colors.ink} />} label={contact.isSelf ? t("contacts.family.self.clear") : t("contacts.family.self.set")} disabled={setSelf.isPending} onPress={toggleSelf} />
          <ActionRow testID="contact-ask" icon={<Users size={20} color={colors.ink} />} label={t("contacts.detail.ask")} onPress={ask} />
          <ActionRow testID="contact-delete" icon={remove.isPending ? <ActivityIndicator color={colors.danger} /> : <Trash2 size={20} color={colors.danger} />} label={t("common.delete")} danger disabled={remove.isPending} onPress={confirmDelete} />
        </View>
      </ScrollView>

      <ActionSheet
        open={rolePicking}
        title={t("contacts.family.whichKind", { name })}
        actions={[
          ...[...FAMILY_ROLES, ...OTHER_ROLES].map((r) => ({ key: r.key, label: cap(roleLabel(t, r)), onPress: () => pickRole(r, { id: contact.id, name }) })),
          ...spouses.flatMap((sp) =>
            IN_LAW_ROLES.map((r) => ({
              key: `${sp.id}-${r.key}`,
              label: cap(roleLabel(t, r)),
              hint: t("contacts.family.viaFamily", { name: sp.name }),
              onPress: () => pickRole(r, { id: sp.id, name: sp.name }),
            })),
          ),
        ]}
        onClose={() => setRolePicking(false)}
        testID="contact-family-role"
      />
      <ActionSheet
        open={adding?.step === "qualifier"}
        title={t("contacts.family.qualifierTitle")}
        actions={adding ? qualifiersFor(adding.tie.role.kind).map((q) => ({
          key: q,
          label: t(`contacts.family.qualifiers.${q}`),
          hint: q === "biological" && adding.tie.role.kind === "sibling" ? t("contacts.family.autoParents") : undefined,
          onPress: () => {
            const tie = { ...adding.tie, qualifier: q };
            afterSheet(() => setAdding({ step: "who", tie }));
          },
        })) : []}
        onClose={() => setAdding((a) => (a?.step === "qualifier" ? null : a))}
        testID="contact-family-qualifier"
      />
      <ActionSheet
        open={adding?.step === "who"}
        title={adding ? t("contacts.family.whoIs", { kind: roleLabel(t, adding.tie.role), name: adding.tie.anchorName }) : ""}
        subtitle={book.isLoading ? t("contacts.list.searching") : undefined}
        actions={adding ? [
          { key: "new", label: t("contacts.family.newPerson"), hint: t("contacts.family.newPersonHint"), icon: Plus, onPress: () => {
            const tie = adding.tie;
            afterSheet(() => setAdding({ step: "name", tie }));
          } },
          ...others.map((c) => ({ key: String(c.id), label: displayName(c) || t("contacts.noName"), onPress: () => linkTo(adding.tie, c) })),
        ] : []}
        onClose={() => {
          setWhoTyped("");
          setAdding((a) => (a?.step === "who" ? null : a));
        }}
        testID="contact-family-who"
        search={{ value: whoTyped, onChange: setWhoTyped, placeholder: t("contacts.list.search") }}
      />
      <NameDialog
        open={adding?.step === "name"}
        title={t("contacts.family.newPersonTitle")}
        confirm={t("contacts.family.add")}
        onCancel={() => setAdding(null)}
        onSubmit={(value) => adding && createAndLink(adding.tie, value)}
        busy={link.isPending}
        error={nameError}
      />
      <ActionSheet
        open={editing?.step === "menu"}
        title={editing ? t("contacts.family.editTitle", { name: editing.relation.relative.name, word: relationWord(t, editing.relation) }) : ""}
        actions={editing ? [
          { key: "role", label: t("contacts.family.changeRole"), icon: Pencil, onPress: () => {
            const relation = editing.relation;
            afterSheet(() => setEditing({ step: "role", relation }));
          } },
          ...(qualifiersFor(editing.relation.kind).length ? [{ key: "qualifier", label: t("contacts.family.changeQualifier"), onPress: () => {
            const relation = editing.relation;
            afterSheet(() => setEditing({ step: "qualifier", relation }));
          } }] : []),
        ] : []}
        onClose={() => setEditing((e) => (e?.step === "menu" ? null : e))}
        testID="contact-relation-menu"
      />
      <ActionSheet
        open={editing?.step === "role"}
        title={editing ? t("contacts.family.roleTitle", { name: editing.relation.relative.name, other: name }) : ""}
        actions={editing ? ALL_ROLES.map((r) => ({
          key: r.key,
          label: cap(roleLabel(t, r)),
          onPress: () => change.mutate({ relation: editing.relation, change: { kind: r.kind, relativeGender: r.gender ?? undefined } }),
        })) : []}
        onClose={() => setEditing(null)}
        testID="contact-relation-role"
      />
      <ActionSheet
        open={editing?.step === "qualifier"}
        title={t("contacts.family.qualifierTitle")}
        actions={editing ? qualifiersFor(editing.relation.kind).map((q) => ({
          key: q,
          label: t(`contacts.family.qualifiers.${q}`),
          onPress: () => change.mutate({ relation: editing.relation, change: { qualifier: q } }),
        })) : []}
        onClose={() => setEditing(null)}
        testID="contact-relation-qualifier"
      />
      {actions.element}
    </Frame>
  );
}

function Card({ children }: { children: ReactNode }) {
  const colors = useColors();
  const metrics = useMetrics();
  return <View style={{ borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>{children}</View>;
}

/** A small pill: closeness, "This is you", a tag (the web's chips). */
function Chip({ label, testID, a11yLabel }: { label: string; testID?: string; a11yLabel?: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View testID={testID} accessible={Boolean(testID)} accessibilityLabel={a11yLabel ?? label} style={{ borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: metrics.space.sm, paddingVertical: 2 }}>
      <Text variant="caption" tone="accent">
        {label}
      </Text>
    </View>
  );
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
