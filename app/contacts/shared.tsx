/**
 * A text shared from another app that holds a phone number or an email
 * (an SMS, a WhatsApp message, a note): "Add as a new contact" or "Add to
 * someone already here" (owner, 2026-11-12, `docs/design/contacts/SPEC.md`
 * §F). The text itself is shown, so he sees what was found and where.
 */
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Mail, Phone, Search, UserPlus, Users, X } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { contactsApi, displayName, type Contact } from "@/api/contacts";
import { failureMessage } from "@/api/failure";
import { ContactAvatar } from "@/screens/contacts/ContactAvatar";
import { localMatch } from "@/screens/contacts/search";
import { mergeInto, sameContact } from "@/screens/contacts/shareIn";
import { sortKey } from "@/screens/contacts/sections";
import { useSharedIntoContacts, type SharedIntoContacts } from "@/stores/sharedIntoContacts.store";
import { contactsKeys } from "@/api/keys";

export default function SharedIntoContactsScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [shared] = useState<Extract<SharedIntoContacts, { kind: "bits" }> | null>(() => {
    const pending = useSharedIntoContacts.getState().take();
    return pending?.kind === "bits" ? pending : null;
  });
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const book = useQuery({ queryKey: contactsKeys.list(), queryFn: contactsApi.list });

  const incoming = useMemo(
    () => ({
      phones: (shared?.phones ?? []).map((value) => ({ label: "mobile", value })),
      emails: (shared?.emails ?? []).map((value) => ({ label: "home", value })),
    }),
    [shared],
  );
  const twin = book.data ? sameContact(incoming, book.data) : null;
  const candidates = useMemo(
    () => [...(book.data ?? [])].filter((c) => localMatch(c, filter)).sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    [book.data, filter],
  );

  if (!shared) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: metrics.space.md }}>
          <Text tone="muted">{t("contacts.share.gone")}</Text>
          <Button label={t("contacts.title")} block={false} onPress={() => router.replace("/contacts")} />
        </View>
      </Screen>
    );
  }

  const addTo = async (c: Contact) => {
    if (busy != null) return;
    setBusy(c.id);
    setError(null);
    try {
      await contactsApi.update(c.id, mergeInto(c, incoming));
      await queryClient.invalidateQueries({ queryKey: contactsKeys.all });
      router.replace({ pathname: "/contacts/contact", params: { id: String(c.id) } });
    } catch (e) {
      setError(failureMessage(e, t("contacts.form.saveFailed")));
    } finally {
      setBusy(null);
    }
  };

  const createNew = () => {
    useSharedIntoContacts.getState().set({
      kind: "card",
      card: {
        firstname: "", lastname: "", nickname: "", company: "", jobTitle: "", website: "", notes: "", birthDate: null,
        phones: incoming.phones, emails: incoming.emails, addresses: [], photo: null,
      },
    });
    router.replace({ pathname: "/contacts/edit", params: { shared: "1" } });
  };

  return (
    <Screen measure>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
        <Pressable testID="contacts-shared-back" onPress={() => (picking ? setPicking(false) : router.back())} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={8} style={{ width: 32, height: 32, justifyContent: "center" }}>
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {picking ? t("contacts.share.pickTitle") : t("contacts.share.title")}
        </Text>
      </View>

      {error ? (
        <Text testID="contacts-shared-error" tone="danger" style={{ paddingBottom: metrics.space.sm }}>
          {error}
        </Text>
      ) : null}

      {!picking ? (
        <ScrollView contentContainerStyle={{ gap: metrics.space.md, paddingBottom: 48 }}>
          <View style={{ borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: metrics.space.md, gap: metrics.space.sm }}>
            {shared.phones.map((p) => (
              <View key={p} testID={`contacts-shared-phone-${p}`} style={{ flexDirection: "row", gap: metrics.space.sm, alignItems: "center" }}>
                <Phone size={18} color={colors.accent} />
                <Text style={{ fontWeight: "600" }}>{p}</Text>
              </View>
            ))}
            {shared.emails.map((e) => (
              <View key={e} testID={`contacts-shared-email-${e}`} style={{ flexDirection: "row", gap: metrics.space.sm, alignItems: "center" }}>
                <Mail size={18} color={colors.accent} />
                <Text style={{ fontWeight: "600" }}>{e}</Text>
              </View>
            ))}
            <Text variant="caption" tone="muted" numberOfLines={6}>
              {t("contacts.share.from", { text: shared.text })}
            </Text>
          </View>

          {twin ? (
            <Text testID="contacts-shared-twin" accessibilityLiveRegion="polite">
              {t("contacts.share.alreadyThere", { name: displayName(twin) || t("contacts.noName") })}
            </Text>
          ) : null}

          {twin ? (
            <Button testID="contacts-shared-open-twin" label={t("contacts.share.open", { name: displayName(twin) })} onPress={() => router.replace({ pathname: "/contacts/contact", params: { id: String(twin.id) } })} />
          ) : null}
          <Pressable
            testID="contacts-shared-new"
            onPress={createNew}
            accessibilityRole="button"
            accessibilityLabel={t("contacts.share.asNew")}
            style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, padding: metrics.space.lg, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <UserPlus size={22} color={colors.accent} />
            <Text style={{ flex: 1, fontWeight: "600" }}>{t("contacts.share.asNew")}</Text>
          </Pressable>
          <Pressable
            testID="contacts-shared-existing"
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel={t("contacts.share.toExisting")}
            style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, padding: metrics.space.lg, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <Users size={22} color={colors.accent} />
            <Text style={{ flex: 1, fontWeight: "600" }}>{t("contacts.share.toExisting")}</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <Search size={18} color={colors.inkMuted} />
            <TextInput testID="contacts-shared-search" value={filter} onChangeText={setFilter} autoFocus placeholder={t("contacts.list.search")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("contacts.list.search")} style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }} />
            {filter ? (
              <Pressable onPress={() => setFilter("")} accessibilityRole="button" accessibilityLabel={t("contacts.list.clearSearch")} hitSlop={8}>
                <X size={18} color={colors.inkMuted} />
              </Pressable>
            ) : null}
          </View>
          {!book.data ? <ActivityIndicator style={{ marginTop: metrics.space.xl }} /> : null}
          <FlatList
            testID="contacts-shared-list"
            data={candidates}
            keyExtractor={(c) => String(c.id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                testID={`contacts-shared-pick-${item.id}`}
                onPress={() => void addTo(item)}
                disabled={busy != null}
                accessibilityRole="button"
                accessibilityLabel={t("contacts.share.addTo", { name: displayName(item) || t("contacts.noName") })}
                style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 60 }}
              >
                <ContactAvatar contact={item} size={40} />
                <Text style={{ flex: 1 }} numberOfLines={1}>
                  {displayName(item) || t("contacts.noName")}
                </Text>
                {busy === item.id ? <ActivityIndicator /> : null}
              </Pressable>
            )}
          />
        </>
      )}
    </Screen>
  );
}
