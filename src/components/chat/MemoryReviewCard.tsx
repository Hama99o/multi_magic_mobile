/**
 * "IS THIS STILL TRUE?" (the web's `components/ai/MemoryReviewCard.tsx`; parity audit, old #34).
 *
 * The facts the assistant remembers that are the most likely to have changed (`Ai::MemoryReview`:
 * where someone lives or works, a price, a role, a number; never a parent, a birthday or an
 * allergy), oldest first, three at most. Each can be confirmed for good, asked again in a month, or
 * removed from what the assistant remembers. Nothing to ask: no card at all, as on the web, which
 * shows it at the top of its AI page; the phone, at the top of the assistant (`app/chat.tsx`).
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memoryReviewApi } from "@/api/ai";
import { aiKeys } from "@/api/keys";
import { Check, History, Trash2 } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useOneAtATime } from "@/hooks/useOneAtATime";

type Answer = "confirmed" | "kept" | "remove";

export function MemoryReviewCard() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const once = useOneAtATime(); // a double tap answers once
  const [notice, setNotice] = useState<"removed" | "failed" | null>(null);
  const facts = useQuery({ queryKey: aiKeys.memoryReview(), queryFn: memoryReviewApi.list, staleTime: 10 * 60_000 });
  const answer = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: Answer }) => {
      if (action === "remove") await memoryReviewApi.remove(id);
      else await memoryReviewApi.answer(id, action);
      return action;
    },
    onMutate: () => setNotice(null),
    onSuccess: (action) => {
      if (action === "remove") setNotice("removed");
      void client.invalidateQueries({ queryKey: aiKeys.memoryReview() });
    },
    onError: () => setNotice("failed"),
  });

  const list = facts.data ?? [];
  if (!list.length && notice !== "removed") return null;

  const button = (id: string, text: string, action: Answer) => {
    const [Icon, label, of, tone] =
      action === "confirmed"
        ? ([Check, "chat.memoryReview.stillTrue", "chat.memoryReview.stillTrueOf", colors.ink] as const)
        : action === "kept"
          ? ([History, "chat.memoryReview.askLater", "chat.memoryReview.askLaterOf", colors.inkMuted] as const)
          : ([Trash2, "chat.memoryReview.notTrue", "chat.memoryReview.notTrueOf", colors.danger] as const);
    return (
      <Pressable
        key={action}
        testID={`memory-review-${id}-${action}`}
        disabled={answer.isPending}
        onPress={() => once(() => answer.mutateAsync({ id, action }))}
        accessibilityRole="button"
        accessibilityLabel={t(of, { fact: text })}
        accessibilityState={{ disabled: answer.isPending }}
        style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: metrics.touch, paddingHorizontal: metrics.space.sm }}
      >
        <Icon size={14} color={tone} />
        <Text variant="caption" style={{ color: tone }}>
          {t(label)}
        </Text>
      </Pressable>
    );
  };

  return (
    <View testID="memory-review" accessibilityLabel={t("chat.memoryReview.title")} style={{ marginHorizontal: metrics.space.md, marginBottom: metrics.space.sm, padding: metrics.space.md, gap: metrics.space.xs, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <Text variant="label" accessibilityRole="header">
        {t("chat.memoryReview.title")}
      </Text>
      <Text variant="caption" tone="muted">
        {t("chat.memoryReview.hint")}
      </Text>
      {list.map((fact) => (
        <View key={fact.id} testID={`memory-review-${fact.id}`} style={{ gap: 2 }}>
          <Text>{fact.text}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {button(fact.id, fact.text, "confirmed")}
            {button(fact.id, fact.text, "kept")}
            {button(fact.id, fact.text, "remove")}
          </View>
        </View>
      ))}
      {notice ? (
        <Text variant="caption" tone={notice === "failed" ? "danger" : "muted"} accessibilityLiveRegion="polite" testID={notice === "failed" ? "memory-review-error" : "memory-review-removed"}>
          {t(notice === "failed" ? "chat.memoryReview.failed" : "chat.memoryReview.removed")}
        </Text>
      ) : null}
    </View>
  );
}
