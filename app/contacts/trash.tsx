/**
 * Deleted contacts (`docs/design/contacts/SPEC.md` §C.9): restore, or delete
 * for ever — which asks, with the name in the question, because it cannot be
 * undone (the web's Trash tab).
 */
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, RotateCcw, Trash2 } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { contactsApi, displayName, type Contact } from "@/api/contacts";
import { failureMessage } from "@/api/failure";
import { ContactAvatar } from "@/screens/contacts/ContactAvatar";
import { sortKey } from "@/screens/contacts/sections";

export default function ContactsTrash() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const trash = useQuery({ queryKey: ["contacts", "trash"], queryFn: contactsApi.trash });
  const reload = () => void queryClient.invalidateQueries({ queryKey: ["contacts"] });

  const restore = useMutation({
    mutationFn: (c: Contact) => contactsApi.restore(c.id),
    onMutate: () => setError(null),
    onSuccess: reload,
    onError: (e) => setError(failureMessage(e, t("contacts.trash.restoreFailed"))),
  });
  const destroy = useMutation({
    mutationFn: (c: Contact) => contactsApi.destroyForever(c.id),
    onMutate: () => setError(null),
    onSuccess: reload,
    onError: (e) => setError(failureMessage(e, t("contacts.trash.deleteFailed"))),
  });

  const confirm = (c: Contact) => {
    const name = displayName(c) || t("contacts.noName");
    Alert.alert(t("contacts.trash.deleteTitle", { name }), t("contacts.trash.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("contacts.trash.deleteForever"), style: "destructive", onPress: () => destroy.mutate(c) },
    ]);
  };

  const rows = [...(trash.data ?? [])].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const busy = (c: Contact) => (restore.isPending && restore.variables?.id === c.id) || (destroy.isPending && destroy.variables?.id === c.id);

  return (
    <Screen measure>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
        <Pressable testID="contacts-trash-back" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={8} style={{ width: 32, height: 32, justifyContent: "center" }}>
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          {t("contacts.trash.title")}
        </Text>
      </View>
      <LoadFailure error={trash.error} loadFailed={t("contacts.trash.loadFailed")} hasData={Boolean(trash.data)} updatedAt={trash.dataUpdatedAt} onRetry={() => void trash.refetch()} testID="contacts-trash-load-failed" />
      {error ? (
        <Text testID="contacts-trash-error" tone="danger" style={{ paddingBottom: metrics.space.sm }}>
          {error}
        </Text>
      ) : null}
      {!trash.data && !trash.error ? <ActivityIndicator style={{ marginTop: metrics.space.xl }} /> : null}
      <FlatList
        testID="contacts-trash-list"
        data={rows}
        keyExtractor={(c) => String(c.id)}
        ListEmptyComponent={
          trash.data ? (
            <Text testID="contacts-trash-empty" tone="muted" style={{ paddingVertical: metrics.space.xl, textAlign: "center" }}>
              {t("contacts.trash.empty")}
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const name = displayName(item) || t("contacts.noName");
          return (
            <View testID={`contacts-trash-row-${item.id}`} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 64 }}>
              <ContactAvatar contact={item} size={40} />
              <Text style={{ flex: 1 }} numberOfLines={1}>
                {name}
              </Text>
              {busy(item) ? (
                <ActivityIndicator />
              ) : (
                <>
                  <Pressable testID={`contacts-trash-restore-${item.id}`} onPress={() => restore.mutate(item)} accessibilityRole="button" accessibilityLabel={t("contacts.trash.restore", { name })} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
                    <RotateCcw size={20} color={colors.accent} />
                  </Pressable>
                  <Pressable testID={`contacts-trash-delete-${item.id}`} onPress={() => confirm(item)} accessibilityRole="button" accessibilityLabel={t("contacts.trash.deleteForeverOf", { name })} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
                    <Trash2 size={20} color={colors.danger} />
                  </Pressable>
                </>
              )}
            </View>
          );
        }}
        contentContainerStyle={{ paddingBottom: 48 }}
      />
    </Screen>
  );
}
