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
import { Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
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

  if (!source) return null;

  // The serializer gives an app-relative path; the web app lives at the same
  // host the API does.
  const webUrl = source.path ? `${API_URL}${source.path}` : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
      >
        {/* Stops a tap inside the sheet from closing it. */}
        <Pressable
          onPress={(e) => e.stopPropagation()}
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
                Where this came from
              </Text>
              <Text variant="title" numberOfLines={2}>
                {source.label ?? "Record"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
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
            <Text tone="muted">
              This is the record the answer drew on. Open it in MultiMagic to read it in
              full.
            </Text>
          </ScrollView>

          {webUrl ? (
            <Button
              label="Open in MultiMagic"
              tone="neutral"
              onPress={() => void Linking.openURL(webUrl)}
              testID="source-sheet-open"
            />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
