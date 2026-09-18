/**
 * Files added to the question that has not been sent yet.
 *
 * A chip ABOVE the composer with its name, size and an `✕`. **A file the
 * assistant has not been told about yet must not look sent** — so the chip
 * carries its own state rather than disappearing on success, and a failed
 * upload stays on screen as failed rather than vanishing, because a file that
 * vanishes looks like one that uploaded.
 *
 * Progress lives on the chip and not in a modal, so a 9 MB PDF can climb while
 * the question is still being typed.
 */
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { X } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { describeSize, type PendingFile } from "@/hooks/useAttachments";

export function PendingFiles({
  files,
  onRemove,
}: {
  files: PendingFile[];
  onRemove: (key: string) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();

  if (files.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: metrics.space.sm, paddingHorizontal: metrics.space.xs }}
      testID="pending-files"
    >
      {files.map((file) => (
        <View
          key={file.key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: metrics.space.sm,
            minHeight: 40,
            paddingHorizontal: metrics.space.md,
            borderRadius: metrics.radius.pill,
            borderWidth: 1,
            borderColor: file.status === "failed" ? colors.danger : colors.border,
            backgroundColor: colors.surface,
          }}
          testID={`pending-file-${file.status}`}
        >
          {file.status === "uploading" ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          <View style={{ maxWidth: 180 }}>
            <Text variant="caption" numberOfLines={1}>
              {file.name}
            </Text>
            <Text variant="caption" tone={file.status === "failed" ? "danger" : "muted"}>
              {file.status === "failed"
                ? (file.error ?? "Did not upload")
                : file.status === "uploading"
                  ? "Uploading…"
                  : describeSize(file.size)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${file.name}`}
            hitSlop={8}
            onPress={() => onRemove(file.key)}
            testID={`pending-file-remove-${file.key}`}
          >
            <X size={16} color={colors.inkMuted} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
