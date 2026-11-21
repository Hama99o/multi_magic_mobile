/**
 * DOC TOOLS — the hub (docs/design/doc/SPEC.md §C.1; web `pages/doc/Index.tsx`).
 *
 * Six tools as cards, two across on a phone and three from 600 dp, each
 * pushing its own screen. Doc keeps no documents: a tool takes a file from
 * the phone, the server works on it, and the result comes back to Share or
 * Save. The one thing kept is the signatures, reached from Sign.
 */
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { router, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { Combine, FileSignature, Layers, RefreshCw, Shrink, Type, type LucideIcon } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics, useScheme } from "@/hooks/useColors";
import { tileColors } from "@/theme/appColors";

export const DOC_TOOLS: { key: string; icon: LucideIcon; route: Href; title: string; blurb: string }[] = [
  { key: "sign", icon: FileSignature, route: "/doc/sign", title: "doc.tools.sign.title", blurb: "doc.tools.sign.blurb" },
  { key: "merge", icon: Combine, route: "/doc/merge", title: "doc.tools.merge.title", blurb: "doc.tools.merge.blurb" },
  { key: "pages", icon: Layers, route: "/doc/pages", title: "doc.tools.pages.title", blurb: "doc.tools.pages.blurb" },
  { key: "text", icon: Type, route: "/doc/text", title: "doc.tools.text.title", blurb: "doc.tools.text.blurb" },
  { key: "convert", icon: RefreshCw, route: "/doc/convert", title: "doc.tools.convert.title", blurb: "doc.tools.convert.blurb" },
  { key: "compress", icon: Shrink, route: "/doc/compress", title: "doc.tools.compress.title", blurb: "doc.tools.compress.blurb" },
];

export default function DocHub() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const columns = width >= 600 ? 3 : 2;
  const tile = tileColors("doc", useScheme());

  return (
    <Screen measure header={<AppHeader app="doc" />}>
      <ScrollView contentContainerStyle={{ gap: metrics.space.lg, paddingBottom: metrics.space.xl, paddingTop: metrics.space.sm }}>
        <Text tone="muted">{t("doc.intro")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.md }} testID="doc-tools">
          {DOC_TOOLS.map((tool) => (
            <Pressable
              key={tool.key}
              testID={`doc-tool-${tool.key}`}
              onPress={() => router.push(tool.route)}
              accessibilityRole="button"
              accessibilityLabel={`${t(tool.title)}. ${t(tool.blurb)}`}
              style={{
                width: `${(100 - (columns - 1) * 4) / columns}%`,
                flexGrow: 1,
                minHeight: 120,
                padding: metrics.space.lg,
                gap: metrics.space.sm,
                borderRadius: metrics.radius.lg,
                backgroundColor: tile.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tile.badge, alignItems: "center", justifyContent: "center" }}>
                <tool.icon size={22} color={tile.glyph} />
              </View>
              <Text variant="label">{t(tool.title)}</Text>
              <Text variant="caption" tone="muted">
                {t(tool.blurb)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text variant="caption" tone="muted">
          {t("doc.serverNote")}
        </Text>
      </ScrollView>
    </Screen>
  );
}
