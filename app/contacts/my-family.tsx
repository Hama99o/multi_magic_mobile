/**
 * My family: the web's "My Family" tab (`pages/contacts/components/FamilyTab.tsx`;
 * parity 2026-11-20). Only the user's family, not the whole book: everyone
 * reachable through family ties from the contact marked as the user, each
 * with what they are to them, in the server's family order (a tree's order,
 * not a list's, so it is not re-sorted newest first).
 *
 * "My family" needs a *me*. Without one, the screen asks who the user is,
 * found by name in their own book, and asks a second time before saving,
 * because one stray tap should not rewrite whose family this is. "Not me"
 * undoes it. Adding a relative happens on the user's own card, where the
 * family section already does it (`ContactCard.tsx`).
 */
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from "react-native";
import { useNav } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, Search, Users } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { contactsApi, displayName, type Contact } from "@/api/contacts";
import { contactsKeys } from "@/api/keys";
import { failureMessage } from "@/api/failure";
import { ContactAvatar } from "@/screens/contacts/ContactAvatar";
import { useSetSelf } from "@/screens/contacts/useContactMutations";
import { familyLabel } from "@/screens/contacts/familyLabel";

export default function MyFamily() {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const family = useQuery({ queryKey: contactsKeys.familyMembers(), queryFn: contactsApi.familyMembers });
  const setSelf = useSetSelf({ onError: (e) => setError(failureMessage(e, t("contacts.family.self.failed"))) });

  const members = family.data?.members ?? [];
  const selfId = family.data?.selfId ?? null;
  const root = members.find((m) => m.id === selfId) ?? null;
  const name = (c: Contact) => displayName(c) || t("contacts.noName");
  const open = (id: number) => router.push({ pathname: "/contacts/contact", params: { id: String(id) } });

  return (
    <Screen measure header={<AppHeader app="contacts" title={t("contacts.myFamily.title")} back />}>
      <LoadFailure error={family.error} loadFailed={t("contacts.myFamily.loadFailed")} hasData={Boolean(family.data)} updatedAt={family.dataUpdatedAt} onRetry={() => void family.refetch()} testID="my-family-load-failed" />
      {error ? (
        <Text testID="my-family-error" tone="danger" style={{ paddingBottom: metrics.space.sm }}>
          {error}
        </Text>
      ) : null}
      {!family.data && !family.error ? <ActivityIndicator style={{ marginTop: metrics.space.xl }} /> : null}
      {family.data ? (
        <FlatList
          testID="my-family-list"
          data={members}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ paddingBottom: 48 }}
          ListHeaderComponent={
            <View style={{ gap: metrics.space.md, paddingVertical: metrics.space.md }}>
              {root ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, flexWrap: "wrap" }}>
                  <CircleCheck size={18} color={colors.accent} />
                  <Text testID="my-family-you-are" style={{ flexShrink: 1 }}>
                    {t("contacts.myFamily.youAre", { name: name(root) })}
                  </Text>
                  <Pressable testID="my-family-change-self" onPress={() => (setError(null), setSelf.mutate({ id: root.id, isSelf: false }))} disabled={setSelf.isPending} accessibilityRole="button" accessibilityLabel={t("contacts.family.self.clear")} hitSlop={8} style={{ minHeight: 40, justifyContent: "center" }}>
                    <Text style={{ color: colors.accent }}>{t("contacts.family.self.clear")}</Text>
                  </Pressable>
                </View>
              ) : (
                <SelfPicker onChoose={(c) => (setError(null), setSelf.mutate({ id: c.id, isSelf: true }))} busy={setSelf.isPending} />
              )}
              <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, flexWrap: "wrap" }}>
                <Users size={18} color={colors.inkMuted} />
                <Text testID="my-family-count" tone="muted" style={{ flex: 1 }}>
                  {t("contacts.myFamily.count", { count: members.length })}
                </Text>
              </View>
              {root ? (
                <View style={{ flexDirection: "row", gap: metrics.space.sm, flexWrap: "wrap" }}>
                  {members.length > 1 ? (
                    <Button testID="my-family-tree" tone="neutral" block={false} label={t("contacts.family.tree")} onPress={() => router.push({ pathname: "/contacts/family", params: { id: String(root.id) } })} />
                  ) : null}
                  <Button testID="my-family-add" block={false} label={t("contacts.myFamily.add")} onPress={() => open(root.id)} />
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <Text testID="my-family-empty" tone="muted" style={{ paddingVertical: metrics.space.xl, textAlign: "center" }}>
              {t("contacts.myFamily.empty")}
            </Text>
          }
          renderItem={({ item }) => {
            const badge = item.id === selfId ? t("contacts.family.you") : familyLabel(item.familyLabel, t);
            return (
              <Pressable
                testID={`my-family-row-${item.id}`}
                onPress={() => open(item.id)}
                accessibilityRole="button"
                accessibilityLabel={badge ? `${name(item)}, ${badge}` : name(item)}
                accessibilityHint={t("contacts.family.openHint")}
                style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 64 }}
              >
                <ContactAvatar contact={item} size={40} />
                <Text style={{ flex: 1 }} numberOfLines={1}>
                  {name(item)}
                </Text>
                {badge ? (
                  <View testID={`my-family-badge-${item.id}`} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: metrics.radius.pill, backgroundColor: `${colors.accent}1f` }}>
                    <Text variant="caption" style={{ color: colors.accent }}>
                      {badge}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      ) : null}
    </Screen>
  );
}

/** Which contact is the user, found by name in their own book; confirmed before it is saved. */
function SelfPicker({ onChoose, busy }: { onChoose: (c: Contact) => void; busy: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const [candidate, setCandidate] = useState<Contact | null>(null);
  const book = useQuery({ queryKey: contactsKeys.list(), queryFn: contactsApi.list });
  const term = typed.trim().toLocaleLowerCase();
  const matches = useMemo(() => (book.data ?? []).filter((c) => !term || displayName(c).toLocaleLowerCase().includes(term)).slice(0, 8), [book.data, term]);
  const label = (c: Contact) => displayName(c) || t("contacts.noName");

  return (
    <View testID="my-family-self" style={{ gap: metrics.space.sm, padding: metrics.space.md, borderRadius: metrics.radius.lg, borderWidth: 1, borderColor: `${colors.accent}55`, backgroundColor: `${colors.accent}12` }}>
      {candidate ? (
        <>
          <Text style={{ fontWeight: "600" }}>{t("contacts.myFamily.confirmSelf", { name: label(candidate) })}</Text>
          <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
            <Button testID="my-family-self-cancel" tone="neutral" block={false} label={t("common.cancel")} onPress={() => setCandidate(null)} />
            <Button testID="my-family-self-yes" block={false} label={t("contacts.family.self.yes")} disabled={busy} onPress={() => onChoose(candidate)} />
          </View>
        </>
      ) : (
        <>
          <Text style={{ fontWeight: "600" }} accessibilityRole="header">
            {t("contacts.myFamily.whoAreYou")}
          </Text>
          <Text variant="caption" tone="muted">
            {t("contacts.myFamily.whoAreYouHint")}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, backgroundColor: colors.ground }}>
            <Search size={16} color={colors.inkMuted} />
            <TextInput testID="my-family-self-search" value={typed} onChangeText={setTyped} placeholder={t("contacts.list.search")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("contacts.list.search")} style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
            {matches.map((c) => (
              <Pressable key={c.id} testID={`my-family-self-${c.id}`} onPress={() => setCandidate(c)} accessibilityRole="button" accessibilityLabel={label(c)} style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
                <Text variant="caption">{label(c)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
