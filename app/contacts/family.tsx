/**
 * The family tree around one contact (`/contacts/family?id=7`), audit #25.
 *
 * The web draws `GET contacts/:id/family` as an SVG to pan and zoom
 * (`FamilyTreeView.tsx`). On a phone the same nodes are read as rows by
 * generation, oldest first (-1 is the parents, 0 this person, +1 the
 * children: `ContactApp::FamilyTree`), the order a tree on paper has. Each
 * person says what they are to the root, in the server's words (the web
 * shows the same words), and opens their own card, which is how an unlimited
 * tree is walked: person by person.
 */
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { contactsApi, type FamilyNode } from "@/api/contacts";
import { contactsKeys } from "@/api/keys";
import { parseId } from "./contact";

/** `MAX_GENERATIONS` is 3 each way; a row further out is named by the nearest. */
const ROWS = ["greatGrandparents", "grandparents", "parents", "same", "children", "grandchildren", "greatGrandchildren"] as const;
const rowName = (generation: number) => ROWS[Math.max(-3, Math.min(3, generation)) + 3];

export default function ContactFamilyTree() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const contactId = parseId(useLocalSearchParams<{ id?: string }>().id) ?? 0;
  const query = useQuery({ queryKey: contactsKeys.family(contactId), queryFn: () => contactsApi.family(contactId), enabled: contactId > 0 });
  const nodes = query.data?.nodes ?? [];
  const root = nodes.find((n) => n.id === query.data?.rootId);

  const generations = [...new Set(nodes.map((n) => n.generation))].sort((a, b) => a - b);
  const byName = (a: FamilyNode, b: FamilyNode) => (a.id === root?.id ? -1 : b.id === root?.id ? 1 : a.name.localeCompare(b.name));

  return (
    <Screen measure>
      <AppHeader app="contacts" title={root?.name ? t("contacts.tree.of", { name: root.name }) : t("contacts.tree.title")} back />
      <LoadFailure error={query.error} loadFailed={t("contacts.tree.loadFailed")} hasData={Boolean(query.data)} updatedAt={query.dataUpdatedAt} onRetry={() => void query.refetch()} testID="family-tree-load-failed" />
      {!query.data && !query.error ? <ActivityIndicator style={{ marginTop: metrics.space.xl }} /> : null}
      <ScrollView contentContainerStyle={{ gap: metrics.space.lg, paddingTop: metrics.space.md, paddingBottom: 48 }}>
        {query.data && nodes.length <= 1 ? (
          <Text testID="family-tree-empty" tone="muted" style={{ textAlign: "center", paddingVertical: metrics.space.xl }}>
            {t("contacts.tree.empty")}
          </Text>
        ) : (
          generations.map((generation) => (
            <View key={generation} testID={`family-tree-row-${generation}`} style={{ gap: metrics.space.sm }}>
              <Text variant="label" tone="muted" accessibilityRole="header">
                {t(`contacts.tree.rows.${rowName(generation)}`)}
              </Text>
              <View style={{ borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" }}>
                {nodes
                  .filter((n) => n.generation === generation)
                  .sort(byName)
                  .map((n, i) => {
                    const about = [
                      n.id === root?.id ? (n.isSelf ? t("contacts.family.you") : null) : n.relation,
                      n.age != null ? t("contacts.detail.age", { count: n.age }) : null,
                      n.deceased ? t("contacts.family.deceased") : null,
                    ].filter(Boolean).join(" · ");
                    return (
                      <Pressable
                        key={n.id}
                        testID={`family-tree-person-${n.id}`}
                        onPress={() => router.push({ pathname: "/contacts/contact", params: { id: String(n.id) } })}
                        accessibilityRole="button"
                        accessibilityLabel={about ? `${n.name}, ${about}` : n.name}
                        accessibilityHint={t("contacts.family.openHint")}
                        android_ripple={{ color: colors.border }}
                        style={{ flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: metrics.space.md, paddingVertical: metrics.space.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text tone={n.id === root?.id ? "accent" : "default"}>{n.name || t("contacts.noName")}</Text>
                          {about ? (
                            <Text variant="caption" tone="muted">
                              {about}
                            </Text>
                          ) : null}
                        </View>
                        <ChevronRight size={18} color={colors.inkMuted} />
                      </Pressable>
                    );
                  })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
