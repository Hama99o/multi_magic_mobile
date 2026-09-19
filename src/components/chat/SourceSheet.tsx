/**
 * What a source chip opens.
 *
 * ── Why a sheet and not a screen ──────────────────────────────────────────
 * `FrontendRoutes.present` returns a **web** route, and this app has no note
 * screen, no loan screen and no contact screen to send it to. Building them
 * would turn four screens into forty.
 *
 * So the preview IS "open it", and that is a feature rather than a shortfall:
 * the point of a source is to see WHY the assistant said what it said, which a
 * title and an excerpt answer. "Open in MultiMagic" stays as the secondary
 * action for anyone who wants the real record, and the primary experience stays
 * in the app.
 */
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { API_URL } from "@/config/env";
import type { MessageLink } from "@/api/ai";

export function SourceSheet({
  source,
  onClose,
}: {
  source: MessageLink | null;
  onClose: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  if (!source) return null;

  // The serializer gives an app-relative path; the web app lives at the same
  // host the API does.
  const webUrl = source.path ? `${API_URL}${source.path}` : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* THE SCRIM IS A SIBLING, NOT A PARENT — docs/ACCESSIBILITY.md N1.
          A named accessibility element groups its children, so a labelled
          Pressable WRAPPING the sheet made the whole modal read as one "Close"
          button and every row inside it unreachable. Behind the content it
          dismisses exactly as before and names only itself. */}
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={onClose}
          style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" }}
        />
        {/* A sibling scrim cannot be reached through the content, so nothing
            needs to stop a tap here any more. */}
        <View
          style={{
            backgroundColor: colors.ground,
            borderTopLeftRadius: metrics.radius.lg,
            borderTopRightRadius: metrics.radius.lg,
            padding: metrics.space.lg,
            // "Open in MultiMagic" is the last row; keep it above the home
            // indicator.
            paddingBottom: metrics.space.lg + insets.bottom,
            gap: metrics.space.lg,
            maxHeight: "70%",
            width: "100%",
            maxWidth: metrics.maxMeasure,
            alignSelf: "center",
          }}
          testID="source-sheet"
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md }}>
            <View style={{ flex: 1 }}>
              <Text variant="label" tone="muted">
                {t("sources.sheetLabel")}
              </Text>
              <Text variant="title" numberOfLines={2}>
                {source.label ?? t("sources.record")}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              hitSlop={10}
              onPress={onClose}
              style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
              testID="source-sheet-close"
            >
              <X size={22} color={colors.inkMuted} />
            </Pressable>
          </View>

          <ScrollView>
            {/* The excerpt the serializer does not send yet. Saying so is
                better than an empty panel that looks broken — and it keeps the
                sheet honest about being a preview rather than the record. */}
            <Text tone="muted">{t("sources.body")}</Text>
          </ScrollView>

          {webUrl ? (
            <Button
              label={t("sources.openInWeb")}
              tone="neutral"
              onPress={() => void Linking.openURL(webUrl)}
              testID="source-sheet-open"
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
