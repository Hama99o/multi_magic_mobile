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
import { ActivityIndicator, Alert, View } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { contactsApi } from "@/api/contacts";
import { failureMessage } from "@/api/failure";
import { ContactForm, type PhotoChange } from "@/screens/contacts/ContactForm";
import { draftFrom, emptyDraft, isDirty, toPayload, type Draft } from "@/screens/contacts/draft";

function parseId(raw: string | undefined): number | null {
  return raw && /^\d+$/.test(raw) ? Number(raw) : null;
}

export default function EditContact() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const contactId = parseId(params.id);
  const queryClient = useQueryClient();
  const navigation = useNavigation();

  const { data: contact, error: loadError, refetch } = useQuery({
    queryKey: ["contacts", "contact", contactId ?? 0],
    queryFn: () => contactsApi.show(contactId ?? 0),
    enabled: contactId != null,
  });

  const [initial, setInitial] = useState<Draft | null>(() => (contactId == null ? emptyDraft() : null));
  const [draft, setDraft] = useState<Draft | null>(initial);
  const [photo, setPhoto] = useState<PhotoChange>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const leaving = useRef(false);

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
      queryClient.setQueryData(["contacts", "contact", saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
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
      />
    </Screen>
  );
}
