/**
 * Profile — `docs/design/profile/SPEC.md`.
 *
 * His instruction: *"you should have a well user edit — you can change the
 * password, you can change the information about user, you can change the
 * photo… For more information like they can visit to web."*
 *
 * ── THE EMAIL IS SHOWN AND LOCKED, AND THAT IS NOT LAZINESS ───────────────
 * The socket identifies the user by the **email in its query string**
 * (`ApplicationCable::Connection#find_verified_user`), which is why `http.ts`
 * stores that address at all. `email` is writable server-side and `User` has no
 * `:confirmable`, so a change lands immediately — the stored address goes
 * stale, and **the cable is rejected on the next reconnect** with nothing on
 * screen to explain why messages stopped arriving.
 *
 * Making it editable is an auth-layer change (`setSessionEmail` in the same
 * breath, then re-test the socket), not a form field. Waking Up locks the same
 * field, so there is a precedent for the shape as well as a reason for it.
 *
 * ── AND THE USER IS FETCHED HERE ──────────────────────────────────────────
 * `useAuthStore.user` is null after a cold start — `_layout.tsx` restores the
 * token without ever calling `connected_user`. This screen asks for itself, so
 * it works today and keeps working when that is fixed. SPEC §0.3.
 */
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft, ChevronRight, ExternalLink, Pencil } from "lucide-react-native";
import * as Linking from "expo-linking";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { profileApi, type ProfileChanges } from "@/api/profile";
import { failureMessage } from "@/api/failure";
import { API_URL } from "@/config/env";
import { Avatar } from "@/screens/people/Avatar";
import { PhotoSheet, type PickedPhoto } from "@/screens/account/PhotoSheet";

function Field({
  label,
  value,
  onChange,
  placeholder,
  testID,
  autoCapitalize = "words",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  testID: string;
  autoCapitalize?: "none" | "words";
}) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View style={{ gap: metrics.space.xs }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        autoCapitalize={autoCapitalize}
        accessibilityLabel={label}
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: metrics.radius.md,
          paddingHorizontal: metrics.space.lg,
          minHeight: metrics.touch,
          color: colors.ink,
          fontSize: 16,
        }}
      />
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const queryClient = useQueryClient();

  const { data: profile, isLoading, error, refetch } = useQuery({
    queryKey: ["profile"],
    queryFn: profileApi.me,
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [about, setAbout] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Seed the form once the profile lands. Keyed on the id so switching accounts
  // cannot leave one person's name in another's form.
  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");
    setAbout(profile.about ?? "");
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Venmo's rule, and the four references that show a state agree: Save is
   *  disabled until something actually changed. It is what tells you the form
   *  noticed your edit. */
  const dirty =
    profile != null &&
    (firstName !== (profile.firstName ?? "") ||
      lastName !== (profile.lastName ?? "") ||
      about !== (profile.about ?? ""));

  const onSaved = (updated: Awaited<ReturnType<typeof profileApi.me>>) => {
    queryClient.setQueryData(["profile"], updated);
    setFailure(null);
    setSaved(true);
  };

  const onFailed = (e: unknown) =>
    setFailure(failureMessage(e, "Could not save that."));

  const save = useMutation({
    mutationFn: (changes: ProfileChanges) => profileApi.update(profile!.id, changes),
    onSuccess: onSaved,
    onError: onFailed,
  });

  const setPhoto = useMutation({
    mutationFn: (photo: PickedPhoto) => profileApi.uploadPhoto(profile!.id, photo),
    onSuccess: onSaved,
    onError: onFailed,
  });

  const clearPhoto = useMutation({
    mutationFn: () => profileApi.removePhoto(profile!.id),
    onSuccess: onSaved,
    onError: onFailed,
  });

  const busy = save.isPending || setPhoto.isPending || clearPhoto.isPending;

  return (
    <Screen measure scroll avoidKeyboard>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: metrics.space.sm,
          paddingVertical: metrics.space.md,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={{ width: 32, height: 32, justifyContent: "center" }}
        >
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" style={{ flex: 1 }}>
          Profile
        </Text>
      </View>

      {error ? (
        <View style={{ paddingVertical: metrics.space.xl, gap: metrics.space.sm }}>
          <Text tone="muted">
            {failureMessage(error, "Could not load your profile.")}
          </Text>
          <Pressable onPress={() => void refetch()} accessibilityRole="button" hitSlop={8}>
            <Text tone="accent">Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {isLoading || !profile ? null : (
        <>
          {/* ── The photo ──────────────────────────────────────────────────
              A text link under the avatar rather than a pencil badge: 5 Minute
              Journal's shape, and the reason is the target — a badge is about
              20 dp and `METRICS.touch` is 48. */}
          <View style={{ alignItems: "center", gap: metrics.space.sm }}>
            <Pressable
              testID="profile-photo"
              onPress={() => setSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Change your photo"
              disabled={busy}
            >
              <Avatar
                name={profile.fullName ?? profile.email ?? "You"}
                uri={profile.avatar}
                userId={profile.id}
                size={88}
              />
            </Pressable>
            <Pressable
              onPress={() => setSheetOpen(true)}
              accessibilityRole="button"
              disabled={busy}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: metrics.space.xs,
                minHeight: metrics.touch,
                paddingHorizontal: metrics.space.md,
              }}
            >
              <Pencil size={14} color={colors.accent} />
              <Text tone="accent" variant="label">
                {setPhoto.isPending || clearPhoto.isPending
                  ? "Updating photo…"
                  : profile.avatar
                    ? "Change photo"
                    : "Add a photo"}
              </Text>
            </Pressable>
          </View>

          <View style={{ gap: metrics.space.lg, marginTop: metrics.space.lg }}>
            <Field label="First name" value={firstName} onChange={setFirstName} testID="profile-firstname" />
            <Field label="Last name" value={lastName} onChange={setLastName} testID="profile-lastname" />
            <Field
              label="About"
              value={about}
              onChange={setAbout}
              placeholder="A line about you"
              testID="profile-about"
              autoCapitalize="none"
            />

            {/* ── Locked, and it says why ──────────────────────────────────
                Not a disabled-looking field with no explanation, which reads
                as a bug. See this file's header. */}
            <View style={{ gap: metrics.space.xs }}>
              <Text variant="caption" tone="muted">
                Email
              </Text>
              <View
                testID="profile-email-locked"
                style={{
                  backgroundColor: colors.ground,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: metrics.radius.md,
                  paddingHorizontal: metrics.space.lg,
                  minHeight: metrics.touch,
                  justifyContent: "center",
                }}
              >
                <Text tone="muted">{profile.email ?? "—"}</Text>
              </View>
              <Text variant="caption" tone="muted">
                Changing your email signs you out of live updates until you sign
                in again, so it is done on the website for now.
              </Text>
            </View>
          </View>

          {failure ? (
            <Text testID="profile-error" tone="danger" variant="caption" style={{ marginTop: metrics.space.md }}>
              {failure}
            </Text>
          ) : saved ? (
            <Text testID="profile-saved" tone="accent" variant="caption" style={{ marginTop: metrics.space.md }}>
              Saved.
            </Text>
          ) : null}

          <Pressable
            testID="profile-save"
            onPress={() => {
              setSaved(false);
              save.mutate({
                firstname: firstName.trim(),
                lastname: lastName.trim(),
                about: about.trim(),
              });
            }}
            disabled={!dirty || busy}
            accessibilityRole="button"
            accessibilityLabel="Save"
            accessibilityState={{ disabled: !dirty || busy }}
            style={{
              marginTop: metrics.space.lg,
              minHeight: metrics.touch,
              borderRadius: metrics.radius.md,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: !dirty || busy ? colors.surface : colors.accent,
            }}
          >
            <Text variant="label" style={{ color: !dirty || busy ? colors.inkMuted : colors.onAccent }}>
              {save.isPending ? "Saving…" : "Save"}
            </Text>
          </Pressable>

          {/* ── The two rows that lead elsewhere ───────────────────────────
              TheFork puts `Change Password` inside the form as a row, which is
              exactly right: it belongs to this screen and is not part of it. */}
          <View
            style={{
              marginTop: metrics.space.xl,
              backgroundColor: colors.surface,
              borderRadius: metrics.radius.md,
              overflow: "hidden",
            }}
          >
            {[
              { key: "password", label: "Change password", to: "/change-password" as const },
              { key: "keys", label: "Your AI provider key", to: "/ai-keys" as const },
            ].map((row, index) => (
              <Pressable
                key={row.key}
                testID={`profile-${row.key}`}
                onPress={() => router.push(row.to)}
                accessibilityRole="button"
                android_ripple={{ color: colors.border }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: metrics.space.lg,
                  minHeight: metrics.touch,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <Text style={{ flex: 1 }}>{row.label}</Text>
                <ChevronRight size={18} color={colors.inkMuted} />
              </Pressable>
            ))}
          </View>

          {/* His own instruction: everything else is on the web. The row says
              WHAT is there — a link that does not say where it goes is a link
              people do not press. */}
          <Pressable
            testID="profile-web"
            onPress={() => void Linking.openURL(API_URL)}
            accessibilityRole="link"
            android_ripple={{ color: colors.border }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: metrics.space.sm,
              marginTop: metrics.space.lg,
              minHeight: metrics.touch,
              paddingHorizontal: metrics.space.sm,
            }}
          >
            <ExternalLink size={16} color={colors.inkMuted} />
            <Text tone="muted" style={{ flex: 1 }}>
              Notes, money, contacts and the rest — open MultiMagic on the web
            </Text>
          </Pressable>

          <PhotoSheet
            visible={sheetOpen}
            hasPhoto={Boolean(profile.avatar)}
            onPicked={(photo) => {
              setSaved(false);
              setPhoto.mutate(photo);
            }}
            onRemove={() => {
              setSaved(false);
              clearPhoto.mutate();
            }}
            onClose={() => setSheetOpen(false)}
          />
        </>
      )}
    </Screen>
  );
}
