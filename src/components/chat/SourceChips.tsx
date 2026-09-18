/**
 * THE RECEIPT UNDER THE CLAIM.
 *
 * This app's whole claim is that it answers from the user's own notes, money,
 * contacts and calendar. An answer with no receipt under it is indistinguishable
 * from any chat app they could install instead — so the records an answer drew
 * on are the difference, not a detail.
 *
 * They were already on the wire and nothing rendered them: `message_serializer`
 * has shipped `sources` since before this app existed.
 *
 * **No sources means NO ROW** — never an empty "Sources" heading. An answer from
 * the model's own knowledge rather than from the user's data is a different kind
 * of answer, and the absence of chips is the honest way to show it.
 *
 * A chip carries the record's kind and title and nothing more: a chip that tries
 * to summarise is a second answer competing with the first.
 */
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import type { MessageLink } from "@/api/ai";

export function SourceChips({
  sources,
  onOpen,
}: {
  sources: MessageLink[];
  onOpen: (source: MessageLink) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();

  if (sources.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Horizontal, so three long note titles cannot push the answer's column
      // wider than the screen at 360 dp.
      contentContainerStyle={{ gap: metrics.space.sm, paddingVertical: metrics.space.xs }}
      testID="source-chips"
    >
      {sources.map((source, index) => (
        <Pressable
          key={`${source.path ?? "source"}-${index}`}
          accessibilityRole="button"
          accessibilityLabel={`Source: ${source.label ?? "record"}`}
          hitSlop={6}
          onPress={() => onOpen(source)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            minHeight: 32,
            paddingHorizontal: metrics.space.md,
            borderRadius: metrics.radius.pill,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <View style={{ maxWidth: 220 }}>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {source.label ?? "Record"}
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}
