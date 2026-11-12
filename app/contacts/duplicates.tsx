/**
 * Likely duplicates (`GET contacts/duplicates`): people sharing an email, or
 * the same name. The web lists them and does not merge; neither does the
 * phone. A tap opens the contact, where the person decides.
 */
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { contactsApi } from "@/api/contacts";

export default function ContactsDuplicates() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ["contacts", "duplicates"], queryFn: contactsApi.duplicates });
  const groups = query.data ?? [];

  return (
    <Screen measure>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
        <Pressable testID="contacts-duplicates-back" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={8} style={{ width: 32, height: 32, justifyContent: "center" }}>
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          {t("contacts.duplicates.title")}
        </Text>
      </View>
      <LoadFailure error={query.error} loadFailed={t("contacts.duplicates.loadFailed")} hasData={Boolean(query.data)} updatedAt={query.dataUpdatedAt} onRetry={() => void query.refetch()} testID="contacts-duplicates-load-failed" />
      {!query.data && !query.error ? <ActivityIndicator style={{ marginTop: metrics.space.xl }} /> : null}
      <ScrollView contentContainerStyle={{ gap: metrics.space.md, paddingBottom: 48 }}>
        {query.data && groups.length === 0 ? (
          <Text testID="contacts-duplicates-none" tone="muted" style={{ textAlign: "center", paddingVertical: metrics.space.xl }}>
            {t("contacts.duplicates.none")}
          </Text>
        ) : null}
        {groups.map((g, i) => (
          <View key={`${g.reason}-${i}`} testID={`contacts-duplicates-group-${i}`} style={{ borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" }}>
            <Text variant="caption" tone="muted" style={{ padding: metrics.space.md, paddingBottom: 0 }}>
              {g.reason === "email" ? t("contacts.duplicates.sameEmail", { email: g.contacts[0]?.email ?? "" }) : t("contacts.duplicates.sameName")}
            </Text>
            {g.contacts.map((c) => (
              <Pressable
                key={c.id}
                testID={`contacts-duplicates-open-${c.id}`}
                onPress={() => router.push({ pathname: "/contacts/contact", params: { id: String(c.id) } })}
                accessibilityRole="button"
                accessibilityLabel={c.name || t("contacts.noName")}
                style={{ flexDirection: "row", alignItems: "center", minHeight: 52, paddingHorizontal: metrics.space.md }}
              >
                <Text style={{ flex: 1 }}>{c.name || t("contacts.noName")}</Text>
                <ChevronRight size={18} color={colors.inkMuted} />
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
