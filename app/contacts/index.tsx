/**
 * Contacts — the list (`docs/design/contacts/SPEC.md` §C.1–2).
 *
 * Every page of the address book, sorted A–Z on the phone, favourites first,
 * an A–Z index on the trailing edge, birthdays soon at the top. Search is the
 * server's (any email, any number since multi_magic a0222268), with the loaded
 * rows filtered by name meanwhile, so typing never shows an empty screen.
 *
 * A tap opens the contact; a long press offers its actions (call, WhatsApp,
 * message, email, share, favourite, delete) without opening it. Select mode
 * exports a few as one .vcf; the More menu imports, exports all, and opens
 * the trash, the duplicates and the WhatsApp country.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Pressable, RefreshControl, ScrollView, SectionList, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import {
  BookUser, Cake, Check, ChevronLeft, CircleCheck, Circle, Copy, Globe, Import, Mail, MessageCircle,
  MoreVertical, Phone, Plus, Search, Share2, Star, StarOff, Trash2, Upload, X,
} from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { AiButton } from "@/components/AiButton";
import { LoadFailure } from "@/components/LoadFailure";
import { CONTACT_KEYS, useAssistantEcho } from "@/hooks/useAssistantEcho";
import { useColors, useMetrics } from "@/hooks/useColors";
import { contactsApi, displayName, vcfFile, type Contact } from "@/api/contacts";
import { failureMessage } from "@/api/failure";
import { ContactAvatar } from "@/screens/contacts/ContactAvatar";
import { ActionSheet, type SheetAction } from "@/screens/contacts/ActionSheet";
import { AzIndex } from "@/screens/contacts/AzIndex";
import { FAVOURITES, sectionsOf, subtitleOf, type Section } from "@/screens/contacts/sections";
import { useContactActions } from "@/screens/contacts/useContactActions";
import { COUNTRIES, countryByCode } from "@/screens/contacts/phone";
import { useContactsUndo } from "@/stores/contactsUndo.store";
import { useContactsCountry } from "@/stores/contactsCountry.store";
import { localMatch } from "@/screens/contacts/search";

const ROW = 64;
const HEADER = 32;
const UNDO_MS = 8000;
const UNDO_MS_SCREEN_READER = 30_000;
const SEARCH_DEBOUNCE_MS = 250;

/** Where every row and header sits, for `getItemLayout`: a jump to Z must not
 *  depend on rows that were never rendered. SectionList counts a header and a
 *  (zero-height) footer per section. */
function layoutOf(sections: Section[]) {
  const out: { length: number; offset: number }[] = [];
  let offset = 0;
  for (const s of sections) {
    out.push({ length: HEADER, offset });
    offset += HEADER;
    for (let i = 0; i < s.data.length; i++) {
      out.push({ length: ROW, offset });
      offset += ROW;
    }
    out.push({ length: 0, offset });
  }
  return out;
}


export default function Contacts() {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const listRef = useRef<SectionList<Contact, Section>>(null);

  const [typed, setTyped] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(typed.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const book = useQuery({ queryKey: ["contacts", "list"], queryFn: contactsApi.list });
  const searching = typed.trim().length > 0;
  const server = useQuery({
    queryKey: ["contacts", "search", term],
    queryFn: () => contactsApi.search(term),
    enabled: term.length >= 2,
  });
  const birthdays = useQuery({ queryKey: ["contacts", "birthdays", 30], queryFn: () => contactsApi.birthdays(30) });

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["contacts"] });
  }, [queryClient]);
  useAssistantEcho(CONTACT_KEYS, reload);

  const country = useContactsCountry((s) => s.country);
  const hydrateCountry = useContactsCountry((s) => s.hydrate);
  const setCountry = useContactsCountry((s) => s.setCountry);
  useEffect(() => {
    void hydrateCountry();
  }, [hydrateCountry]);

  const sections = useMemo<Section[]>(() => {
    const all = book.data ?? [];
    if (!searching) return sectionsOf(all);
    // The server's answer for this exact term when it has one (it also matches
    // a second email or a number written another way); the loaded rows by
    // name until then.
    const found = server.data && term === typed.trim() ? server.data : all.filter((c) => localMatch(c, typed));
    const rows = sectionsOf(found.map((c) => ({ ...c, favorite: false })));
    return rows.length ? [{ key: "results", data: rows.flatMap((s) => s.data) }] : [];
  }, [book.data, server.data, searching, term, typed]);
  const layout = useMemo(() => layoutOf(sections), [sections]);
  const letters = useMemo(() => sections.map((s) => s.key).filter((k) => k !== FAVOURITES && k !== "results"), [sections]);

  const jump = useCallback(
    (letter: string) => {
      const sectionIndex = sections.findIndex((s) => s.key === letter);
      if (sectionIndex < 0) return;
      listRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, viewOffset: 0, viewPosition: 0, animated: false });
    },
    [sections],
  );

  // ── select mode (export a few) ─────────────────────────────────────────
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allIds = useMemo(() => (book.data ?? []).map((c) => c.id), [book.data]);
  const leaveSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const [exportError, setExportError] = useState<string | null>(null);
  const exporting = useMutation({
    mutationFn: async (which: number[] | "all") => {
      const file = vcfFile(await contactsApi.exportVcf(which), which === "all" ? "contacts" : `contacts-${which.length}`);
      try {
        await Sharing.shareAsync(file.uri, { mimeType: "text/vcard", UTI: "public.vcard", dialogTitle: t("contacts.list.exportTitle") });
      } finally {
        try {
          if (file.exists) file.delete();
        } catch {
          // The cache is the system's to clear.
        }
      }
    },
    onMutate: () => setExportError(null),
    onSuccess: () => leaveSelect(),
    onError: (e) => setExportError(failureMessage(e, t("contacts.list.exportFailed"))),
  });

  // ── a row's long press ─────────────────────────────────────────────────
  const [pressed, setPressed] = useState<Contact | null>(null);
  const actions = useContactActions(pressed);
  const favourite = useMutation({
    mutationFn: (c: Contact) => contactsApi.setFavorite(c.id, !c.favorite),
    onSuccess: reload,
  });
  const trashedSet = useContactsUndo((s) => s.set);
  const remove = useMutation({
    mutationFn: async (c: Contact) => {
      await contactsApi.remove(c.id);
      return c;
    },
    onSuccess: (c) => {
      trashedSet({ id: c.id, name: displayName(c), at: Date.now() });
      reload();
    },
  });
  const rowActions = (c: Contact): SheetAction[] => [
    { key: "call", icon: Phone, label: t("contacts.actions.call"), disabled: !c.phones.length, onPress: () => actions.act("call") },
    { key: "whatsapp", icon: MessageCircle, label: t("contacts.actions.whatsapp"), disabled: !c.phones.length, onPress: () => actions.act("whatsapp") },
    { key: "sms", icon: MessageCircle, label: t("contacts.actions.sms"), disabled: !c.phones.length, onPress: () => actions.act("sms") },
    { key: "email", icon: Mail, label: t("contacts.actions.email"), disabled: !c.emails.length, onPress: () => actions.act("email") },
    { key: "share", icon: Share2, label: t("contacts.actions.share"), onPress: () => void actions.share() },
    {
      key: "favourite",
      icon: c.favorite ? StarOff : Star,
      label: c.favorite ? t("contacts.actions.unfavourite") : t("contacts.actions.favourite"),
      onPress: () => favourite.mutate(c),
    },
    { key: "delete", icon: Trash2, label: t("contacts.actions.delete"), danger: true, onPress: () => remove.mutate(c) },
  ];

  // ── More ───────────────────────────────────────────────────────────────
  const [more, setMore] = useState<"menu" | "country" | null>(null);
  const lang = i18n.language === "fr" ? "fr" : "en";
  const countryName = countryByCode(country)?.name[lang] ?? t("contacts.country.none");
  const moreActions: SheetAction[] = [
    { key: "import", icon: Import, label: t("contacts.menu.import"), hint: t("contacts.menu.importHint"), onPress: () => router.push("/contacts/import") },
    { key: "export-all", icon: Upload, label: t("contacts.menu.exportAll"), disabled: !allIds.length, onPress: () => exporting.mutate("all") },
    { key: "select", icon: CircleCheck, label: t("contacts.menu.select"), disabled: !allIds.length, onPress: () => setSelecting(true) },
    { key: "duplicates", icon: Copy, label: t("contacts.menu.duplicates"), onPress: () => router.push("/contacts/duplicates") },
    { key: "trash", icon: Trash2, label: t("contacts.menu.trash"), onPress: () => router.push("/contacts/trash") },
    { key: "country", icon: Globe, label: t("contacts.menu.country"), hint: countryName, onPress: () => setMore("country") },
  ];

  // ── Undo (a delete from here or from the detail) ───────────────────────
  const trashed = useContactsUndo((s) => s.trashed);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => live && setScreenReader(on))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.("screenReaderChanged", setScreenReader);
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  useEffect(() => {
    if (trashed) AccessibilityInfo.announceForAccessibility(`${t("contacts.movedToTrash", { name: trashed.name })} ${t("contacts.undo")}`);
  }, [trashed, t]);
  useEffect(() => {
    if (!trashed) return;
    const left = (screenReader ? UNDO_MS_SCREEN_READER : UNDO_MS) - (Date.now() - trashed.at);
    const timer = setTimeout(() => trashedSet(null), Math.max(0, left));
    return () => clearTimeout(timer);
  }, [trashed, trashedSet, screenReader]);
  const undo = async () => {
    if (!trashed || undoing) return;
    setUndoing(true);
    setUndoError(null);
    try {
      await contactsApi.restore(trashed.id);
      trashedSet(null);
      reload();
    } catch (e) {
      setUndoError(failureMessage(e, t("contacts.undoFailed")));
    } finally {
      setUndoing(false);
    }
  };

  const count = allIds.length;
  const empty = book.data && count === 0;
  const soon = !searching && !selecting ? (birthdays.data ?? []).slice(0, 10) : [];

  return (
    <Screen measure>
      {/* Header: back · title · select · more · assistant. In select mode the
          title says how many and the left button leaves the mode. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
        <Pressable
          testID={selecting ? "contacts-select-done" : "contacts-back"}
          onPress={() => (selecting ? leaveSelect() : router.back())}
          accessibilityRole="button"
          accessibilityLabel={selecting ? t("contacts.list.leaveSelect") : t("common.back")}
          hitSlop={8}
          style={{ width: 32, height: 32, justifyContent: "center" }}
        >
          {selecting ? <X size={22} color={colors.ink} /> : <ChevronLeft size={24} color={colors.ink} />}
        </Pressable>
        <Text testID="contacts-title" variant="title" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {selecting ? t("contacts.list.selected", { count: selected.size }) : t("contacts.title")}
        </Text>
        {selecting ? (
          <Pressable
            testID="contacts-select-all"
            onPress={() => setSelected(selected.size === allIds.length ? new Set() : new Set(allIds))}
            accessibilityRole="button"
            accessibilityLabel={selected.size === allIds.length ? t("contacts.list.selectNone") : t("contacts.list.selectAll")}
            style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.sm }}
          >
            <Text tone="accent" variant="label">
              {selected.size === allIds.length ? t("contacts.list.selectNone") : t("contacts.list.selectAll")}
            </Text>
          </Pressable>
        ) : (
          <>
            <Pressable testID="contacts-more" onPress={() => setMore("menu")} accessibilityRole="button" accessibilityLabel={t("contacts.menu.title")} hitSlop={4} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
              <MoreVertical size={22} color={colors.ink} />
            </Pressable>
            <AiButton compact />
          </>
        )}
      </View>

      {!empty ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <Search size={18} color={colors.inkMuted} />
          <TextInput
            testID="contacts-search"
            value={typed}
            onChangeText={setTyped}
            placeholder={t("contacts.list.searchPlaceholder", { count })}
            placeholderTextColor={colors.inkMuted}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t("contacts.list.search")}
            style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }}
          />
          {typed ? (
            <Pressable testID="contacts-search-clear" onPress={() => setTyped("")} accessibilityRole="button" accessibilityLabel={t("contacts.list.clearSearch")} hitSlop={8} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
              <X size={18} color={colors.inkMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <LoadFailure error={book.error} loadFailed={t("contacts.loadFailed")} hasData={Boolean(book.data)} updatedAt={book.dataUpdatedAt} onRetry={() => void book.refetch()} testID="contacts-load-failed" />
      {exportError ? (
        <Text testID="contacts-export-error" tone="danger" style={{ paddingTop: metrics.space.sm }}>
          {exportError}
        </Text>
      ) : null}
      {remove.error ? (
        <Text testID="contacts-delete-error" tone="danger" style={{ paddingTop: metrics.space.sm }}>
          {failureMessage(remove.error, t("contacts.detail.deleteFailed"))}
        </Text>
      ) : null}

      {!book.data && !book.error ? (
        <ActivityIndicator testID="contacts-loading" style={{ marginTop: metrics.space.xl }} />
      ) : null}

      {empty ? (
        // A polished empty state: what this is, and the two ways in.
        <ScrollView contentContainerStyle={{ alignItems: "center", paddingVertical: 48, gap: metrics.space.md }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <BookUser size={40} color={colors.accent} />
          </View>
          <Text testID="contacts-empty" variant="title" style={{ fontSize: 22, textAlign: "center" }}>
            {t("contacts.empty.title")}
          </Text>
          <Text tone="muted" style={{ textAlign: "center", maxWidth: 320 }}>
            {t("contacts.empty.body")}
          </Text>
          <View style={{ width: "100%", maxWidth: 320, gap: metrics.space.sm, paddingTop: metrics.space.sm }}>
            <Button testID="contacts-empty-import" label={t("contacts.empty.import")} onPress={() => router.push("/contacts/import")} />
            <Button testID="contacts-empty-new" tone="neutral" label={t("contacts.empty.new")} onPress={() => router.push("/contacts/edit")} />
          </View>
        </ScrollView>
      ) : book.data ? (
        <View style={{ flex: 1, flexDirection: "row" }}>
          <SectionList
            ref={listRef}
            testID="contacts-list"
            style={{ flex: 1 }}
            sections={sections}
            keyExtractor={(c) => `${c.id}`}
            stickySectionHeadersEnabled
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            getItemLayout={(_data, index) => ({ ...(layout[index] ?? { length: ROW, offset: ROW * index }), index })}
            onScrollToIndexFailed={() => undefined}
            refreshControl={<RefreshControl refreshing={book.isRefetching} onRefresh={reload} tintColor={colors.inkMuted} />}
            ListHeaderComponent={
              soon.length ? (
                <View testID="contacts-birthdays" style={{ paddingTop: metrics.space.md }}>
                  <Text variant="label" tone="muted" accessibilityRole="header" style={{ paddingBottom: metrics.space.xs }}>
                    {t("contacts.birthdays.title")}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: metrics.space.sm }}>
                    {soon.map((b) => (
                      <Pressable
                        key={b.contact.id}
                        testID={`contacts-birthday-${b.contact.id}`}
                        onPress={() => router.push({ pathname: "/contacts/contact", params: { id: String(b.contact.id) } })}
                        accessibilityRole="button"
                        accessibilityLabel={`${displayName(b.contact)}, ${b.inDays === 0 ? t("contacts.birthdays.today") : t("contacts.birthdays.inDays", { count: b.inDays })}${b.turning ? `, ${t("contacts.birthdays.turning", { age: b.turning })}` : ""}`}
                        style={{ width: 92, alignItems: "center", gap: 4, padding: metrics.space.sm, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                      >
                        <ContactAvatar contact={b.contact} size={44} />
                        <Text variant="caption" numberOfLines={1}>
                          {b.contact.firstname || displayName(b.contact)}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                          <Cake size={12} color={colors.accent} />
                          <Text variant="caption" tone="accent" numberOfLines={1}>
                            {b.inDays === 0 ? t("contacts.birthdays.today") : t("contacts.birthdays.inDaysShort", { count: b.inDays })}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null
            }
            ListEmptyComponent={
              searching ? (
                <Text testID="contacts-no-results" tone="muted" style={{ paddingVertical: metrics.space.xl, textAlign: "center" }}>
                  {server.isFetching ? t("contacts.list.searching") : t("contacts.list.noResults", { term: typed.trim() })}
                </Text>
              ) : null
            }
            renderSectionHeader={({ section }) =>
              section.key === "results" ? null : (
                <View style={{ height: HEADER, justifyContent: "flex-end", backgroundColor: colors.ground }}>
                  <Text testID={`contacts-section-${section.key}`} variant="label" tone={section.key === FAVOURITES ? "accent" : "muted"} accessibilityRole="header">
                    {section.key === FAVOURITES ? `★ ${t("contacts.list.favourites")}` : section.key}
                  </Text>
                </View>
              )
            }
            renderItem={({ item }) => {
              const isOn = selected.has(item.id);
              const name = displayName(item) || t("contacts.noName");
              return (
                <Pressable
                  testID={`contacts-row-${item.id}`}
                  onPress={() => (selecting ? toggle(item.id) : router.push({ pathname: "/contacts/contact", params: { id: String(item.id) } }))}
                  onLongPress={() => (selecting ? undefined : setPressed(item))}
                  delayLongPress={350}
                  accessibilityRole={selecting ? "checkbox" : "button"}
                  accessibilityState={selecting ? { checked: isOn } : undefined}
                  accessibilityLabel={[name, item.favorite ? t("contacts.list.favourite") : null, subtitleOf(item) || null].filter(Boolean).join(", ")}
                  accessibilityHint={selecting ? undefined : t("contacts.list.rowHint")}
                  accessibilityActions={selecting ? undefined : [{ name: "longpress", label: t("contacts.list.moreActions") }]}
                  onAccessibilityAction={(e) => e.nativeEvent.actionName === "longpress" && setPressed(item)}
                  style={{ height: ROW, flexDirection: "row", alignItems: "center", gap: metrics.space.md }}
                >
                  <ContactAvatar contact={item} size={44} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text numberOfLines={1} style={{ fontWeight: "600", flexShrink: 1 }}>
                        {name}
                      </Text>
                      {item.favorite ? <Star size={14} color={colors.accent} fill={colors.accent} /> : null}
                    </View>
                    {subtitleOf(item) ? (
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {subtitleOf(item)}
                      </Text>
                    ) : null}
                  </View>
                  {selecting ? (isOn ? <CircleCheck size={24} color={colors.accent} /> : <Circle size={24} color={colors.inkMuted} />) : null}
                </Pressable>
              );
            }}
            contentContainerStyle={{ paddingBottom: 112 }}
            showsVerticalScrollIndicator={false}
          />
          {!searching && !selecting ? <AzIndex letters={letters} onJump={jump} testID="contacts-index" /> : null}
        </View>
      ) : null}

      {selecting ? (
        <View style={{ position: "absolute", left: metrics.space.lg, right: metrics.space.lg, bottom: insets.bottom + metrics.space.lg }}>
          <Button
            testID="contacts-export-selected"
            label={t("contacts.list.exportSelected", { count: selected.size })}
            disabled={selected.size === 0 || exporting.isPending}
            busy={exporting.isPending}
            onPress={() => exporting.mutate([...selected])}
          />
        </View>
      ) : trashed ? (
        <View
          testID="contacts-undo"
          accessibilityLiveRegion="polite"
          style={{ position: "absolute", left: metrics.space.lg, right: metrics.space.lg, bottom: insets.bottom + metrics.space.lg, flexDirection: "row", alignItems: "center", gap: metrics.space.md, paddingHorizontal: metrics.space.lg, minHeight: 52, borderRadius: metrics.radius.md, backgroundColor: colors.ink }}
        >
          <Text style={{ flex: 1, color: colors.ground }} numberOfLines={2}>
            {undoError ?? t("contacts.movedToTrash", { name: trashed.name })}
          </Text>
          <Pressable testID="contacts-undo-button" onPress={() => void undo()} disabled={undoing} accessibilityRole="button" accessibilityLabel={t("contacts.undo")} hitSlop={8} style={{ minHeight: metrics.touch, justifyContent: "center" }}>
            <Text variant="label" style={{ color: colors.ground, textDecorationLine: "underline" }}>
              {t("contacts.undo")}
            </Text>
          </Pressable>
        </View>
      ) : !empty ? (
        <Pressable
          testID="contacts-new"
          onPress={() => router.push("/contacts/edit")}
          accessibilityRole="button"
          accessibilityLabel={t("contacts.newContact")}
          style={{ position: "absolute", right: metrics.space.lg, bottom: insets.bottom + metrics.space.lg, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, elevation: 4, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
        >
          <Plus size={26} color={colors.onAccent} />
        </Pressable>
      ) : null}

      <ActionSheet open={more === "menu"} title={t("contacts.menu.title")} actions={moreActions} onClose={() => setMore(null)} testID="contacts-menu" />
      <ActionSheet
        open={more === "country"}
        title={t("contacts.country.title")}
        subtitle={t("contacts.country.body")}
        actions={COUNTRIES.map((c) => ({ key: c.code, label: `${c.name[lang]} (+${c.dial})`, icon: c.code === country ? Check : undefined, onPress: () => setCountry(c.code) }))}
        onClose={() => setMore(null)}
        testID="contacts-country"
      />
      <ActionSheet
        open={pressed != null}
        title={pressed ? displayName(pressed) || t("contacts.noName") : ""}
        subtitle={pressed ? subtitleOf(pressed) : undefined}
        actions={pressed ? rowActions(pressed) : []}
        onClose={() => setPressed(null)}
        testID="contacts-row-actions"
      />
      {actions.element}
      {actions.error ? (
        <Text testID="contacts-action-error" tone="danger">
          {actions.error}
        </Text>
      ) : null}
    </Screen>
  );
}
