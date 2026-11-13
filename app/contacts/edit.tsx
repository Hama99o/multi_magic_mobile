/**
 * New contact (`/contacts/edit`) or edit one (`/contacts/edit?id=7`) —
 * `docs/design/contacts/SPEC.md` §C.6, the Calendar's `edit.tsx` pattern:
 *
 * - Save is guarded twice against a double tap: the button is disabled while
 *   saving AND a ref refuses a second call in the same frame (two taps once
 *   made two events in the Calendar; the ref is the part that is not a race).
 * - A failed save keeps the draft and says why, under the header. Nothing is
 *   queued for later.
 * - Leaving with changes asks first (Cancel, back gesture, Android back).
 * - The photo goes AFTER the contact is saved (a new contact has no id to
 *   attach it to); a photo that fails says so on the contact, it does not
 *   undo a save that worked.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { File, Paths } from "expo-file-system";
import { useColors, useMetrics } from "@/hooks/useColors";
import { contactsApi, displayName } from "@/api/contacts";
import { failureMessage } from "@/api/failure";
import { ContactForm, type PhotoChange } from "@/screens/contacts/ContactForm";
import { draftFrom, emptyDraft, isDirty, toPayload, type Draft } from "@/screens/contacts/draft";
import { mergeInto, sameContact, type ParsedCard } from "@/screens/contacts/shareIn";
import { useSharedIntoContacts } from "@/stores/sharedIntoContacts.store";
import { contactsKeys } from "@/api/keys";

/** A card shared from another app → the form's draft. */
function draftFromCard(card: ParsedCard): Draft {
  const base = emptyDraft();
  return {
    ...base,
    firstname: card.firstname, lastname: card.lastname, nickname: card.nickname, company: card.company,
    jobTitle: card.jobTitle, website: card.website, notes: card.notes, birthDate: card.birthDate,
    phones: card.phones.length ? card.phones : base.phones,
    emails: card.emails.length ? card.emails : base.emails,
    addresses: card.addresses,
  };
}

/** The card's inline photo, written to the cache so it uploads like a picked one. */
function photoFromCard(card: ParsedCard): PhotoChange {
  if (!card.photo || typeof globalThis.atob !== "function") return null;
  try {
    const raw = globalThis.atob(card.photo.base64.replace(/\s+/g, ""));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const ext = card.photo.mimeType.split("/")[1] ?? "jpg";
    const file = new File(Paths.cache, `shared-contact-${Date.now()}.${ext}`);
    file.create();
    file.write(bytes);
    return { kind: "set", uri: file.uri, name: `photo.${ext}`, mimeType: card.photo.mimeType };
  } catch {
    return null;
  }
}

function parseId(raw: string | undefined): number | null {
  return raw && /^\d+$/.test(raw) ? Number(raw) : null;
}

export default function EditContact() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string; shared?: string }>();
  const contactId = parseId(params.id);
  const colors = useColors();
  const metrics = useMetrics();
  // A card shared from another app, taken once (`ShareIntentBridge`).
  const [shared] = useState<ParsedCard | null>(() => {
    if (params.shared !== "1" || contactId != null) return null;
    const pending = useSharedIntoContacts.getState().take();
    return pending?.kind === "card" ? pending.card : null;
  });
  const queryClient = useQueryClient();
  const navigation = useNavigation();

  const { data: contact, error: loadError, refetch } = useQuery({
    queryKey: contactsKeys.detail(contactId ?? 0),
    queryFn: () => contactsApi.show(contactId ?? 0),
    enabled: contactId != null,
  });

  const [initial, setInitial] = useState<Draft | null>(() => (contactId == null ? emptyDraft() : null));
  const [draft, setDraft] = useState<Draft | null>(() => (shared ? draftFromCard(shared) : initial));
  const [photo, setPhoto] = useState<PhotoChange>(() => (shared ? photoFromCard(shared) : null));

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const leaving = useRef(false);

  // Someone already in the book with one of these numbers or emails?
  const book = useQuery({ queryKey: contactsKeys.list(), queryFn: contactsApi.list, enabled: shared != null });
  const twin = shared && draft && book.data ? sameContact(toPayload(draft), book.data) : null;
  const [merging, setMerging] = useState(false);
  const mergeIntoTwin = async () => {
    if (!twin || !draft || merging) return;
    setMerging(true);
    setSaveError(null);
    try {
      const merged = mergeInto(twin, toPayload(draft));
      await contactsApi.update(twin.id, merged);
      await queryClient.invalidateQueries({ queryKey: contactsKeys.all });
      leaving.current = true;
      router.replace({ pathname: "/contacts/contact", params: { id: String(twin.id) } });
    } catch (e) {
      setSaveError(failureMessage(e, t("contacts.form.saveFailed")));
    } finally {
      setMerging(false);
    }
  };

  // Filled ONCE from the full view: a background refetch must not throw away
  // what is being typed.
  useEffect(() => {
    if (contact && initial == null) {
      const filled = draftFrom(contact);
      setInitial(filled);
      setDraft(filled);
    }
  }, [contact, initial]);

  const dirty = Boolean(draft && initial && (isDirty(draft, initial) || photo != null));

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (leaving.current || !dirty) return;
      e.preventDefault();
      Alert.alert(t("contacts.form.discardTitle"), t("contacts.form.discardBody"), [
        { text: t("contacts.form.keepEditing"), style: "cancel" },
        {
          text: t("contacts.form.discard"),
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

  const pickPhoto = async (from: "camera" | "library") => {
    try {
      const permission = from === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setSaveError(from === "camera" ? t("contacts.form.cameraDenied") : t("contacts.form.libraryDenied"));
        return;
      }
      const options = { mediaTypes: ["images" as const], allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.8 };
      const result = from === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = !result.canceled ? result.assets[0] : undefined;
      if (asset) {
        setPhoto({ kind: "set", uri: asset.uri, name: asset.fileName ?? `photo-${Date.now()}.jpg`, mimeType: asset.mimeType ?? "image/jpeg" });
      }
    } catch (e) {
      setSaveError(failureMessage(e, t("contacts.form.photoFailed")));
    }
  };

  const save = useCallback(async () => {
    if (!draft || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = toPayload(draft);
      let saved = contactId == null ? await contactsApi.create(payload) : await contactsApi.update(contactId, payload);
      let photoError: string | null = null;
      try {
        if (photo?.kind === "set") saved = await contactsApi.uploadPhoto(saved.id, photo);
        if (photo?.kind === "remove") saved = await contactsApi.removePhoto(saved.id);
      } catch (e) {
        photoError = failureMessage(e, t("contacts.form.photoFailed"));
      }
      queryClient.setQueryData(contactsKeys.detail(saved.id), saved);
      await queryClient.invalidateQueries({ queryKey: contactsKeys.all });
      leaving.current = true;
      if (contactId == null) router.replace({ pathname: "/contacts/contact", params: { id: String(saved.id) } });
      else router.back();
      if (photoError) Alert.alert(t("contacts.form.savedWithoutPhoto"), photoError);
    } catch (e) {
      setSaveError(failureMessage(e, t("contacts.form.saveFailed")));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, [draft, contactId, photo, queryClient, t]);

  if (!draft) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
          {loadError ? (
            <>
              <Text testID="contact-form-load-failed" tone="muted">
                {failureMessage(loadError, t("contacts.detail.loadFailed"))}
              </Text>
              <Button label={t("common.tryAgain")} block={false} onPress={() => void refetch()} />
            </>
          ) : (
            <ActivityIndicator testID="contact-form-loading" />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen avoidKeyboard>
      <ContactForm
        mode={contactId == null ? "create" : "edit"}
        draft={draft}
        onChange={setDraft}
        onCancel={() => router.back()}
        onSave={() => void save()}
        saving={saving}
        saveError={saveError}
        photo={photo}
        photoUrl={contact?.photoUrl ?? null}
        contactId={contactId ?? 0}
        onPickPhoto={(from) => void pickPhoto(from)}
        onRemovePhoto={() => setPhoto({ kind: "remove" })}
        notice={
          twin ? (
            <View testID="contact-form-duplicate" accessibilityLiveRegion="polite" style={{ gap: metrics.space.sm, padding: metrics.space.md, marginBottom: metrics.space.sm, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent }}>
              <Text>{t("contacts.share.alreadyThere", { name: displayName(twin) || t("contacts.noName") })}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.md }}>
                <Pressable testID="contact-form-merge" onPress={() => void mergeIntoTwin()} disabled={merging} accessibilityRole="button" accessibilityLabel={t("contacts.share.addTo", { name: displayName(twin) })} style={{ minHeight: 40, justifyContent: "center" }}>
                  <Text tone="accent" variant="label">
                    {merging ? t("common.saving") : t("contacts.share.addTo", { name: displayName(twin) })}
                  </Text>
                </Pressable>
                <Pressable
                  testID="contact-form-open-twin"
                  onPress={() => {
                    leaving.current = true;
                    router.replace({ pathname: "/contacts/contact", params: { id: String(twin.id) } });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t("contacts.share.open", { name: displayName(twin) })}
                  style={{ minHeight: 40, justifyContent: "center" }}
                >
                  <Text tone="accent" variant="label">
                    {t("contacts.share.open", { name: displayName(twin) })}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null
        }
      />
    </Screen>
  );
}
