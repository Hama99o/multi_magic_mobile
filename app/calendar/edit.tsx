/**
 * New event (`/calendar/edit?day=2026-11-12`) or edit one
 * (`/calendar/edit?id=41`). `docs/design/calendar/SPEC.md` §C.3–4.
 *
 * - Save is guarded twice against a double tap: the button is disabled while
 *   saving AND a ref refuses a second call that lands in the same frame,
 *   before React has re-rendered the disabled state. Two taps once made two
 *   events; the ref is the part that is not a race.
 * - A failed save keeps the draft and says why, in the form. Nothing is
 *   queued for later: a calendar write that lands an hour late at the wrong
 *   time is worse than a clear "not saved" (SPEC §C.9).
 * - Leaving with changes asks first — Cancel, the back gesture and Android's
 *   back button all go through `beforeRemove`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { calendarApi } from "@/api/calendar";
import { failureMessage } from "@/api/failure";
import { EventForm } from "@/screens/calendar/EventForm";
import { draftFromEvent, isDirty, newDraft, toPayload, type Draft } from "@/screens/calendar/draft";
import { todayKey } from "@/screens/calendar/dates";
import { calendarKeys } from "@/api/keys";

function parseId(raw: string | undefined): number | null {
  return raw && /^\d+$/.test(raw) ? Number(raw) : null;
}

export default function EditEvent() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string; day?: string }>();
  const eventId = parseId(params.id);
  const queryClient = useQueryClient();
  const navigation = useNavigation();

  const { data: event, error: loadError, refetch } = useQuery({
    queryKey: calendarKeys.event(eventId ?? 0),
    queryFn: () => calendarApi.show(eventId ?? 0),
    enabled: eventId != null,
  });

  const [initial, setInitial] = useState<Draft | null>(() =>
    eventId == null ? newDraft(params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : todayKey()) : null,
  );
  const [draft, setDraft] = useState<Draft | null>(initial);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const leaving = useRef(false);

  // An existing event fills the draft ONCE: a background refetch must not
  // throw away what is being typed (the web's `draftFor` rule).
  useEffect(() => {
    if (event && initial == null) {
      const filled = draftFromEvent(event);
      setInitial(filled);
      setDraft(filled);
    }
  }, [event, initial]);

  const dirty = Boolean(draft && initial && isDirty(draft, initial));

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (leaving.current || !dirty) return;
      e.preventDefault();
      Alert.alert(t("calendar.form.discardTitle"), t("calendar.form.discardBody"), [
        { text: t("calendar.form.keepEditing"), style: "cancel" },
        {
          text: t("calendar.form.discard"),
          style: "destructive",
          onPress: () => {
            leaving.current = true;
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
    return unsubscribe;
  }, [navigation, dirty, t]);

  const save = useCallback(async () => {
    if (!draft || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = toPayload(draft);
      const saved = eventId == null ? await calendarApi.create(payload, draft.reminders) : await calendarApi.update(eventId, payload, draft.reminders);
      queryClient.setQueryData(calendarKeys.event(saved.id), saved);
      // Every window that could show it: the agenda, every month, the detail.
      await queryClient.invalidateQueries({ queryKey: calendarKeys.all });
      leaving.current = true;
      router.back();
    } catch (e) {
      setSaveError(failureMessage(e, t("calendar.form.saveFailed")));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, [draft, eventId, queryClient, t]);

  if (!draft) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
          {loadError ? (
            <>
              <Text testID="event-form-load-failed" tone="muted">
                {failureMessage(loadError, t("calendar.detail.loadFailed"))}
              </Text>
              <Button label={t("common.tryAgain")} block={false} onPress={() => void refetch()} />
            </>
          ) : (
            <ActivityIndicator testID="event-form-loading" />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen avoidKeyboard>
      <EventForm
        mode={eventId == null ? "create" : "edit"}
        series={Boolean(event?.recurrence)}
        draft={draft}
        onChange={setDraft}
        onCancel={() => router.back()}
        onSave={() => void save()}
        saving={saving}
        saveError={saveError}
      />
    </Screen>
  );
}
