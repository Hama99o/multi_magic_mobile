/**
 * THE MORNING BRIEF SWITCH: `users.ai_morning_brief`, multi_magic 55ca44c.
 *
 * One notification at 08:00 in the person's own time zone: today's events,
 * birthdays this week, loans past due, a card expiring, and the one spending
 * category well out of line (3523c7e). Nothing on a quiet day. Built from
 * their data, never by a model. Off by default on the server, and until
 * 2026-09-24 it could only be turned on from the web's AI keys page: the
 * phone had no switch for the assistant its owner uses on the phone.
 *
 * Rule Zero, Mobbin searched first (2026-09-24): WHOOP
 * (`mobbin.com/screens/8d1cac1c-1775-420d-b89b-abd42680158d`) "Daily stress
 * summary", a titled switch with one line of what it is; Craft
 * (`mobbin.com/screens/9948aee5-fe4c-42c7-a97a-2fa0ad8a3dc2`) "Receive Daily
 * Email", which says what the summary holds AND its time, 8:00 AM; ABY
 * Journal (`mobbin.com/screens/6041b16c-eb04-4329-9d34-56cfb35053e0`)
 * "Morning Intention 8:00 AM"; Abode
 * (`mobbin.com/screens/2a487fa1-c8ef-47ba-a543-b91879b2acc4`) "Morning
 * Summary". TAKE: a titled switch, and one line saying what arrives and
 * WHEN, because this opts into something that appears at eight without
 * being asked for. REJECT: a time picker; the server sends at 08:00 and
 * nothing else. All four put it under a notifications screen, which this app
 * does not have. It sits beside the keys, as on the web, so it is in the same
 * place on either device (Hamma9901).
 *
 * THE SERVER'S STATE, NEVER ASSUMED: rendered only when `connected_user`
 * carries the field. A server that predates it sends none, and a switch
 * showing "off" there would be a claim about a feature that server does not
 * have. Written optimistically, put back if the server refuses, with the
 * reason on screen.
 */
import { useState } from "react";
import { Switch, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { profileApi, type Profile } from "@/api/profile";
import { failureMessage } from "@/api/failure";

export function MorningBriefRow() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);
  const [justTurnedOn, setJustTurnedOn] = useState(false);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: profileApi.me });

  const setBrief = useMutation({
    mutationFn: (on: boolean) => profileApi.update((profile as Profile).id, { ai_morning_brief: on }),
    onMutate: (on) => {
      setFailure(null);
      setJustTurnedOn(false);
      const before = queryClient.getQueryData<Profile>(["profile"]);
      if (before) queryClient.setQueryData<Profile>(["profile"], { ...before, aiMorningBrief: on });
      return { before };
    },
    onError: (e, _on, context) => {
      if (context?.before) queryClient.setQueryData(["profile"], context.before);
      setFailure(failureMessage(e, t("aiKeys.briefFailed")));
    },
    onSuccess: (saved, on) => {
      queryClient.setQueryData(["profile"], saved);
      setJustTurnedOn(on);
    },
  });

  // Not a boolean means the server did not say: show nothing, never "off".
  if (!profile || typeof profile.aiMorningBrief !== "boolean") return null;

  return (
    <View testID="ai-keys-brief" style={{ marginTop: metrics.space.xl, gap: metrics.space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{t("aiKeys.briefTitle")}</Text>
          <Text variant="caption" tone="muted">
            {t("aiKeys.briefHint")}
          </Text>
        </View>
        <Switch
          value={profile.aiMorningBrief}
          onValueChange={(on) => setBrief.mutate(on)}
          disabled={setBrief.isPending}
          accessibilityLabel={t("aiKeys.briefTitle")}
          accessibilityHint={t("aiKeys.briefHint")}
          trackColor={{ true: colors.accent, false: colors.border }}
          testID="ai-keys-brief-switch"
        />
      </View>
      {justTurnedOn ? (
        <Text variant="caption" tone="muted" accessibilityLiveRegion="polite" testID="ai-keys-brief-on">
          {t("aiKeys.briefOn")}
        </Text>
      ) : null}
      {failure ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite" testID="ai-keys-brief-failed">
          {failure}
        </Text>
      ) : null}
    </View>
  );
}
