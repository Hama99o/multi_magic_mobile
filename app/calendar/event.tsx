/**
 * One event, shown before it can be changed (`/calendar/event?id=41&on=…`).
 * `docs/design/calendar/SPEC.md` §C.2–3 and §C.7.
 *
 * Detail first — date · time, then the title, then labelled rows (Joi, Amie) —
 * because opening straight into a form puts the record one stray keystroke
 * from being changed and buries "when is the dentist" among inputs (the web's
 * reason, `CALENDAR_APP.md`).
 *
 * `on` is the occurrence that was tapped: a birthday shows THIS year's date
 * and this year's age, not 1990's.
 *
 * What is drawn follows the server's `current_user_permission`: Edit for the
 * owner and an editor, Delete and the guest list's controls for the owner,
 * Accept / Decline / Leave for a guest. The old tap-to-ask lives on as a
 * button here, so nothing the agenda used to do was lost.
 */
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarDays, ChevronLeft, ExternalLink, LogOut, MapPin, MessageSquareText, NotebookPen, Pencil, Repeat, Trash2, Users } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { calendarApi, sharesApi } from "@/api/calendar";
import { profileApi } from "@/api/profile";
import { aiApi } from "@/api/ai";
import { failureMessage } from "@/api/failure";
import { useDraft } from "@/hooks/useDraft";
import { eventColor } from "@/screens/calendar/colors";
import { dayKey, formatDayLong, yearsOn } from "@/screens/calendar/dates";
import { GuestsSection } from "@/screens/calendar/GuestsSection";
import { useCalendarUndo } from "@/stores/calendarUndo.store";

function Row({ icon, label, children, testID }: { icon: ReactNode; label: string; children: ReactNode; testID?: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View testID={testID} style={{ flexDirection: "row", gap: metrics.space.md, paddingVertical: metrics.space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ paddingTop: 2 }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        {children}
      </View>
    </View>
  );
}

function clock(iso: string, language: string): string {
  return new Date(iso).toLocaleTimeString(language, { hour: "numeric", minute: "2-digit" });
}

/** A maps search for a free-text place; Apple Maps on iOS, the geo intent's chooser on Android. */
function mapsUrl(location: string): string {
  const query = encodeURIComponent(location);
  return Platform.OS === "ios" ? `http://maps.apple.com/?q=${query}` : `geo:0,0?q=${query}`;
}

export default function EventDetail() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string; on?: string }>();
  const eventId = params.id && /^\d+$/.test(params.id) ? Number(params.id) : 0;
  const setTrashed = useCalendarUndo((state) => state.set);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: event, error, refetch, isPending } = useQuery({
    queryKey: ["calendar", "event", eventId],
    queryFn: () => calendarApi.show(eventId),
    enabled: eventId > 0,
  });
  const { data: me } = useQuery({ queryKey: ["profile"], queryFn: profileApi.me, enabled: Boolean(event && event.permission !== "owner") });
  const { data: sessionId } = useQuery({ queryKey: ["ai", "currentSession"], queryFn: aiApi.currentSessionId });
  const { setDraft } = useDraft(sessionId ?? null);

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ["calendar"] });

  const remove = useMutation({
    mutationFn: () => calendarApi.remove(eventId),
    onSuccess: () => {
      setTrashed({ id: eventId, title: event?.title ?? t("calendar.untitled"), at: Date.now() });
      void refreshAll();
      router.back();
    },
    onError: (e) => setActionError(failureMessage(e, t("calendar.detail.deleteFailed"))),
  });
  const respond = useMutation({
    mutationFn: (answer: "accepted" | "declined") => sharesApi.respond(eventId, answer),
    onMutate: () => setActionError(null),
    onSuccess: () => void refreshAll(),
    onError: (e) => setActionError(failureMessage(e, t("calendar.guests.failed"))),
  });
  const leave = useMutation({
    mutationFn: (shareId: number) => sharesApi.remove(eventId, shareId),
    onSuccess: () => {
      void refreshAll();
      router.back();
    },
    onError: (e) => setActionError(failureMessage(e, t("calendar.guests.failed"))),
  });

  if (!event) {
    return (
      <Screen>
        <Header onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: metrics.space.lg }}>
          {error || eventId === 0 ? (
            <>
              <Text testID="event-load-failed" tone="muted" style={{ textAlign: "center" }}>
                {failureMessage(error, t("calendar.detail.loadFailed"))}
              </Text>
              {eventId > 0 ? <Button label={t("common.tryAgain")} block={false} onPress={() => void refetch()} /> : null}
            </>
          ) : isPending ? (
            <ActivityIndicator testID="event-loading" color={colors.inkMuted} />
          ) : null}
        </View>
      </Screen>
    );
  }

  // The tapped occurrence's day; else the event's own first day, in LOCAL
  // terms (never `startsAt.slice(0, 10)`, which is the UTC date).
  const shownOn =
    params.on && /^\d{4}-\d{2}-\d{2}$/.test(params.on)
      ? params.on
      : event.allDay
        ? event.startsOn
        : event.startsAt
          ? dayKey(new Date(event.startsAt))
          : null;
  const language = i18n.language;
  const title = event.title ?? t("calendar.untitled");
  const age = shownOn ? yearsOn(event, shownOn) : null;
  const canWrite = event.permission === "owner" || event.permission === "editor";
  const isOwner = event.permission === "owner";
  const isGuest = event.permission === "editor" || event.permission === "viewer";
  const myShare = me ? event.shares.find((share) => share.sharedWithId === me.id) : undefined;

  const dayLine = shownOn ? formatDayLong(shownOn, language) : "";
  let timeLine = t("calendar.allDay");
  if (!event.allDay && event.startsAt) {
    // The occurrence's own instants are not on this page; the event's carry
    // the time of day, which is the same for every occurrence.
    timeLine = event.endsAt ? `${clock(event.startsAt, language)} – ${clock(event.endsAt, language)}` : clock(event.startsAt, language);
  } else if (event.allDay && event.endsOn && event.startsOn && event.endsOn !== event.startsOn) {
    timeLine = t("calendar.detail.allDayUntil", { date: formatDayLong(event.endsOn, language) });
  }

  const ask = () => {
    setDraft(t("calendar.question", { title, when: dayLine }));
    router.push("/chat");
  };

  const confirmDelete = () =>
    Alert.alert(t("calendar.detail.deleteTitle", { title }), t("calendar.detail.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => remove.mutate() },
    ]);

  const confirmLeave = () =>
    myShare &&
    Alert.alert(t("calendar.detail.leaveTitle", { title }), t("calendar.detail.leaveBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("calendar.detail.leave"), style: "destructive", onPress: () => leave.mutate(myShare.id) },
    ]);

  const icon = (Icon: typeof Bell) => <Icon size={18} color={colors.inkMuted} />;

  return (
    <Screen>
      <Header
        onBack={() => router.back()}
        right={
          canWrite ? (
            <Pressable
              testID="event-edit"
              onPress={() => router.push({ pathname: "/calendar/edit", params: { id: String(event.id) } })}
              accessibilityRole="button"
              accessibilityLabel={t("calendar.detail.edit")}
              style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
            >
              <Pencil size={20} color={colors.ink} />
            </Pressable>
          ) : null
        }
      />
      <ScrollView testID="event-detail" contentContainerStyle={{ paddingBottom: metrics.space.xl * 2 }}>
        <View style={{ flexDirection: "row", gap: metrics.space.md, paddingBottom: metrics.space.md }}>
          <View style={{ width: 6, borderRadius: 3, backgroundColor: eventColor(event) }} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text variant="title" accessibilityRole="header" testID="event-title">
              {title}
            </Text>
            <Text tone="muted" testID="event-kind">
              {[t(`calendar.kind.${event.kind ?? "event"}`, { defaultValue: t("calendar.kind.event") }), age != null ? t("calendar.detail.age", { count: age }) : null].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </View>

        {!canWrite ? (
          <Text testID="event-read-only" variant="caption" tone="muted" style={{ paddingBottom: metrics.space.sm }}>
            {t("calendar.detail.readOnly", { name: event.owner?.name ?? "" })}
          </Text>
        ) : null}

        <Row icon={icon(CalendarDays)} label={t("calendar.detail.when")} testID="event-when">
          {dayLine ? <Text>{dayLine}</Text> : null}
          <Text tone="muted">{timeLine}</Text>
        </Row>

        {event.recurrence ? (
          <Row icon={icon(Repeat)} label={t("calendar.form.repeat")} testID="event-repeat">
            <Text>
              {event.recurrenceUntil
                ? t("calendar.repeatsUntil", { rule: t(`calendar.recurrence.${event.recurrence}`), date: formatDayLong(event.recurrenceUntil, language) })
                : t(`calendar.recurrence.${event.recurrence}`, { defaultValue: event.recurrence })}
            </Text>
          </Row>
        ) : null}

        {event.location ? (
          <Row icon={icon(MapPin)} label={t("calendar.form.locationLabel")} testID="event-location">
            <Text selectable>{event.location}</Text>
            <Pressable
              testID="event-open-maps"
              onPress={() => void Linking.openURL(mapsUrl(event.location ?? "")).catch(() => setActionError(t("calendar.detail.mapsFailed")))}
              accessibilityRole="link"
              accessibilityLabel={t("calendar.detail.openInMaps")}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36 }}
            >
              <ExternalLink size={14} color={colors.accent} />
              <Text tone="accent" variant="label">
                {t("calendar.detail.openInMaps")}
              </Text>
            </Pressable>
          </Row>
        ) : null}

        {event.description ? (
          <Row icon={icon(NotebookPen)} label={t("calendar.form.notesLabel")} testID="event-notes">
            <Text selectable>{event.description}</Text>
          </Row>
        ) : null}

        <Row icon={icon(Bell)} label={t("calendar.form.remindMe")} testID="event-reminders">
          <Text tone={event.reminders.length ? "default" : "muted"}>
            {event.reminders.length
              ? event.reminders.map((reminder) => t(`calendar.lead.${reminder.leadMinutes}`, { defaultValue: t("calendar.minutes", { count: reminder.leadMinutes }) })).join(", ")
              : t("calendar.detail.noReminders")}
          </Text>
        </Row>

        {isGuest ? (
          <Row icon={icon(Users)} label={t("calendar.detail.organizer")} testID="event-organizer">
            <Text>{event.owner?.name ?? ""}</Text>
            <Text tone="muted" variant="caption">
              {t("calendar.detail.yourAccess", { access: t(`calendar.permission.${event.permission}`) })}
            </Text>
          </Row>
        ) : null}

        {isGuest ? (
          <View testID="event-rsvp" style={{ paddingVertical: metrics.space.md, gap: metrics.space.sm }}>
            <Text testID="event-rsvp-state">
              {event.response === "accepted" ? t("calendar.detail.youAccepted") : event.response === "declined" ? t("calendar.detail.youDeclined") : t("calendar.detail.areYouComing")}
            </Text>
            <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
              <View style={{ flex: 1 }}>
                <Button testID="event-accept" label={t("calendar.detail.accept")} tone={event.response === "accepted" ? "primary" : "neutral"} busy={respond.isPending && respond.variables === "accepted"} disabled={respond.isPending} onPress={() => respond.mutate("accepted")} />
              </View>
              <View style={{ flex: 1 }}>
                <Button testID="event-decline" label={t("calendar.detail.decline")} tone={event.response === "declined" ? "danger" : "neutral"} busy={respond.isPending && respond.variables === "declined"} disabled={respond.isPending} onPress={() => respond.mutate("declined")} />
              </View>
            </View>
          </View>
        ) : null}

        <View style={{ paddingTop: metrics.space.lg }}>
          <GuestsSection event={event} />
        </View>

        {actionError ? (
          <Text testID="event-action-error" tone="danger" accessibilityLiveRegion="assertive" style={{ paddingTop: metrics.space.md }}>
            {actionError}
          </Text>
        ) : null}

        <View style={{ gap: metrics.space.sm, paddingTop: metrics.space.xl }}>
          <ActionRow testID="event-ask" icon={<MessageSquareText size={20} color={colors.ink} />} label={t("calendar.detail.ask")} onPress={ask} />
          {isOwner ? (
            <ActionRow testID="event-delete" icon={remove.isPending ? <ActivityIndicator color={colors.danger} /> : <Trash2 size={20} color={colors.danger} />} label={t("common.delete")} danger disabled={remove.isPending} onPress={confirmDelete} />
          ) : null}
          {isGuest && myShare ? (
            <ActionRow testID="event-leave" icon={leave.isPending ? <ActivityIndicator color={colors.danger} /> : <LogOut size={20} color={colors.danger} />} label={t("calendar.detail.leave")} danger disabled={leave.isPending} onPress={() => void confirmLeave()} />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Header({ onBack, right }: { onBack: () => void; right?: ReactNode }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: metrics.space.sm }}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={8} style={{ width: metrics.touch, height: metrics.touch, justifyContent: "center" }}>
        <ChevronLeft size={24} color={colors.ink} />
      </Pressable>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

function ActionRow({ icon, label, onPress, danger, disabled, testID }: { icon: ReactNode; label: string; onPress: () => void; danger?: boolean; disabled?: boolean; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      android_ripple={{ color: colors.border }}
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: metrics.touch + 4, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border }}
    >
      {icon}
      <Text tone={danger ? "danger" : "default"}>{label}</Text>
    </Pressable>
  );
}
