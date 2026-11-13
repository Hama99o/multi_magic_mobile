/**
 * Who else sees this event (the web's `EventShareSection`, SPEC §A).
 *
 * The OWNER manages it: invite by email with an access level, change access,
 * remove. A GUEST sees the list read-only; their own answer and "leave" live
 * on the detail page. Nobody is offered a control the server would refuse
 * (`event_share_policy.rb`: index/create/update are the owner's).
 */
import { useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, UserPlus, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { sharesApi, type CalendarEvent, type GuestPermission, type Share } from "@/api/calendar";
import { failureMessage } from "@/api/failure";
import { ChoiceSheet } from "./ChoiceSheet";
import { calendarKeys } from "@/api/keys";
import { useInviteGuest, useRemoveGuest, useSetGuestAccess } from "@/screens/calendar/useCalendarMutations";

export function GuestsSection({ event }: { event: CalendarEvent }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const isOwner = event.permission === "owner";
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<GuestPermission>("viewer");
  const [editing, setEditing] = useState<Share | null>(null);
  const [pickingNew, setPickingNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: listed } = useQuery({
    queryKey: calendarKeys.shares(event.id),
    queryFn: () => sharesApi.list(event.id),
    enabled: isOwner,
  });
  const shares = isOwner ? (listed ?? event.shares) : event.shares;

  const fail = (e: unknown) => setError(failureMessage(e, t("calendar.guests.failed")));
  const inviting = useInviteGuest(event.id, { onDone: () => setEmail(""), onError: fail });
  const invite = { ...inviting, mutate: () => (setError(null), inviting.mutate({ email, access })) };
  const changing = useSetGuestAccess(event.id, { onError: fail });
  const change = { ...changing, mutate: (v: { share: Share; permission: GuestPermission }) => (setError(null), changing.mutate(v)) };
  const removing = useRemoveGuest(event.id, { onError: fail });
  const remove = { ...removing, mutate: (share: Share) => (setError(null), removing.mutate(share)) };

  const confirmRemove = (share: Share) =>
    Alert.alert(t("calendar.guests.removeTitle", { name: share.sharedWithName }), t("calendar.guests.removeBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("calendar.guests.remove"), style: "destructive", onPress: () => remove.mutate(share) },
    ]);

  const accessChoices = [
    { value: "viewer" as const, label: t("calendar.permission.viewer"), hint: t("calendar.guests.viewerHint") },
    { value: "editor" as const, label: t("calendar.permission.editor"), hint: t("calendar.guests.editorHint") },
  ];
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  if (!isOwner && shares.length === 0) return null;

  return (
    <View testID="event-guests" style={{ gap: metrics.space.sm }}>
      <Text variant="caption" tone="muted" accessibilityRole="header" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
        {t("calendar.guests.title")}
      </Text>

      {shares.length === 0 ? (
        <Text tone="muted" testID="event-guests-none">
          {t("calendar.guests.none")}
        </Text>
      ) : (
        shares.map((share) => (
          <View key={share.id} testID={`event-guest-${share.id}`} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1}>{share.sharedWithName}</Text>
              <Text variant="caption" tone="muted">
                {`${t(`calendar.permission.${share.permission}`)} · ${t(`calendar.response.${share.response}`)}`}
              </Text>
            </View>
            {isOwner ? (
              <>
                <Pressable
                  testID={`event-guest-${share.id}-access`}
                  onPress={() => setEditing(share)}
                  accessibilityRole="button"
                  accessibilityLabel={t("calendar.guests.changeAccess", { name: share.sharedWithName })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: metrics.touch, paddingHorizontal: metrics.space.sm }}
                >
                  <Text variant="label">{t(`calendar.permission.${share.permission}`)}</Text>
                  <ChevronDown size={16} color={colors.inkMuted} />
                </Pressable>
                <Pressable
                  testID={`event-guest-${share.id}-remove`}
                  onPress={() => confirmRemove(share)}
                  accessibilityRole="button"
                  accessibilityLabel={t("calendar.guests.removeTitle", { name: share.sharedWithName })}
                  style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
                >
                  <X size={18} color={colors.inkMuted} />
                </Pressable>
              </>
            ) : null}
          </View>
        ))
      )}

      {isOwner ? (
        <View style={{ gap: metrics.space.sm, paddingTop: metrics.space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
            <TextInput
              testID="event-guests-email"
              value={email}
              onChangeText={setEmail}
              placeholder={t("calendar.guests.emailPlaceholder")}
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel={t("calendar.guests.emailLabel")}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={() => validEmail && !invite.isPending && invite.mutate()}
              style={{ flex: 1, minHeight: metrics.touch, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16 }}
            />
            <Pressable
              testID="event-guests-access"
              onPress={() => setPickingNew(true)}
              accessibilityRole="button"
              accessibilityLabel={t("calendar.guests.accessFor", { access: t(`calendar.permission.${access}`) })}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: metrics.touch, paddingHorizontal: metrics.space.sm }}
            >
              <Text variant="label">{t(`calendar.permission.${access}`)}</Text>
              <ChevronDown size={16} color={colors.inkMuted} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
            <UserPlus size={18} color={colors.inkMuted} />
            <View style={{ flex: 1 }}>
              <Button testID="event-guests-invite" label={t("calendar.guests.invite")} tone="neutral" busy={invite.isPending} disabled={!validEmail} onPress={() => invite.mutate()} />
            </View>
          </View>
        </View>
      ) : null}

      {error ? (
        <Text testID="event-guests-error" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <ChoiceSheet<GuestPermission>
        open={editing != null}
        title={editing ? t("calendar.guests.changeAccess", { name: editing.sharedWithName }) : ""}
        testID="event-guest-access-sheet"
        value={editing?.permission ?? "viewer"}
        choices={accessChoices}
        onPick={(permission) => editing && permission !== editing.permission && change.mutate({ share: editing, permission })}
        onClose={() => setEditing(null)}
      />
      <ChoiceSheet<GuestPermission>
        open={pickingNew}
        title={t("calendar.guests.accessLabel")}
        testID="event-guests-access-sheet"
        value={access}
        choices={accessChoices}
        onPick={setAccess}
        onClose={() => setPickingNew(false)}
      />
    </View>
  );
}
