/**
 * Profile — `docs/design/profile/SPEC.md`.
 *
 * His instruction: *"you should have a well user edit — you can change the
 * password, you can change the information about user, you can change the
 * photo… For more information like they can visit to web."*
 *
 * ── THE EMAIL IS NOT A FIELD HERE ─────────────────────────────────────────
 * The socket identifies the user by the **email in its query string**
 * (`ApplicationCable::Connection#find_verified_user`), which is why `http.ts`
 * stores that address at all. So the email is shown read-only, and changed on
 * its own screen (`app/change-email.tsx`, 2026-11-17): the password, a code to
 * the new address, and `setSessionEmail` in the same step as the server's yes.
 * It was locked here before that flow existed; the reason it is not a plain
 * field is unchanged.
 *
 * ── AND THE USER IS FETCHED HERE ──────────────────────────────────────────
 * `useAuthStore.user` is null after a cold start — `_layout.tsx` restores the
 * token without ever calling `connected_user`. This screen asks for itself, so
 * it works today and keeps working when that is fixed. SPEC §0.3.
 */
import { useEffect, useState } from "react";
import { Image, Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Pencil } from "@/components/icons";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { profileApi } from "@/api/profile";
import { failureMessage } from "@/api/failure";
import { LoadFailure } from "@/components/LoadFailure";
import { Avatar } from "@/screens/people/Avatar";
import { PhotoSheet } from "@/screens/account/PhotoSheet";
import { profileKeys } from "@/api/keys";
import { useProfilePhoto, useSaveProfile } from "@/hooks/useAccountMutations";
import { LinkRow } from "@/components/settings/AccountUi";
import { birthDateProblem } from "@/lib/birthDate";


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
  const { t } = useTranslation();

  const { data: profile, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: profileKeys.me(),
    queryFn: profileApi.me,
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [about, setAbout] = useState("");
  const [username, setUsername] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [coverSheetOpen, setCoverSheetOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Seed the form once the profile lands. Keyed on the id so switching accounts
  // cannot leave one person's name in another's form.
  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");
    setAbout(profile.about ?? "");
    setUsername(profile.username ?? "");
    setBirthDate(profile.birthDate ?? "");
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Venmo's rule, and the four references that show a state agree: Save is
   *  disabled until something actually changed. It is what tells you the form
   *  noticed your edit. */
  const dirty =
    profile != null &&
    (firstName !== (profile.firstName ?? "") ||
      lastName !== (profile.lastName ?? "") ||
      about !== (profile.about ?? "") ||
      username !== (profile.username ?? "") ||
      birthDate !== (profile.birthDate ?? ""));
  const birthDateBad = birthDateProblem(birthDate);

  // The hooks put the server's answer in the cache (`useAccountMutations.ts`).
  const onSaved = () => {
    setFailure(null);
    setSaved(true);
  };

  const onFailed = (e: unknown) => setFailure(failureMessage(e, t("profile.saveFailed")));

  const save = useSaveProfile(profile?.id ?? null, { onSaved, onError: onFailed });
  const photo = useProfilePhoto(profile?.id ?? null, { onSaved, onError: onFailed });
  const setPhoto = photo.set;
  const clearPhoto = photo.clear;
  const cover = useProfilePhoto(profile?.id ?? null, { onSaved, onError: onFailed }, "cover_photo");

  const busy =
    save.isPending || setPhoto.isPending || clearPhoto.isPending || cover.set.isPending || cover.clear.isPending;
  const saveOff = !dirty || busy || birthDateBad;

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
          accessibilityLabel={t("common.back")}
          hitSlop={8}
          style={{ width: 32, height: 32, justifyContent: "center" }}
        >
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" style={{ flex: 1 }}>
          {t("profile.title")}
        </Text>
      </View>

      <LoadFailure
        error={error}
        loadFailed={t("profile.loadFailed")}
        hasData={Boolean(profile)}
        updatedAt={dataUpdatedAt}
        onRetry={() => void refetch()}
        testID="profile-load-failed"
      />

      {isLoading || !profile ? null : (
        <>
          {/* ── The photo ──────────────────────────────────────────────────
              A text link under the avatar rather than a pencil badge: 5 Minute
              Journal's shape, and the reason is the target — a badge is about
              20 dp and `METRICS.touch` is 48. */}
          {/* ── The cover, the web's banner (Show.tsx) ───────────────────── */}
          <Pressable
            testID="profile-cover"
            onPress={() => setCoverSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={profile.coverPhoto ? t("profileMore.coverChange") : t("profileMore.coverAdd")}
            disabled={busy}
            style={{
              height: 112,
              borderRadius: metrics.radius.md,
              overflow: "hidden",
              backgroundColor: colors.surface,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: metrics.space.md,
            }}
          >
            {profile.coverPhoto ? (
              <Image
                testID="profile-cover-image"
                source={{ uri: profile.coverPhoto }}
                accessibilityLabel={t("profileMore.coverLabel")}
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                resizeMode="cover"
              />
            ) : null}
            <Text tone="accent" variant="label">
              {cover.set.isPending || cover.clear.isPending
                ? t("profileMore.coverUpdating")
                : profile.coverPhoto
                  ? t("profileMore.coverChange")
                  : t("profileMore.coverAdd")}
            </Text>
          </Pressable>

          <View style={{ alignItems: "center", gap: metrics.space.sm }}>
            <Pressable
              testID="profile-photo"
              onPress={() => setSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t("profile.changeYourPhoto")}
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
                  ? t("profile.updatingPhoto")
                  : profile.avatar
                    ? t("profile.changePhoto")
                    : t("profile.addPhoto")}
              </Text>
            </Pressable>
          </View>

          <View style={{ gap: metrics.space.lg, marginTop: metrics.space.lg }}>
            <Field label={t("profile.firstName")} value={firstName} onChange={setFirstName} testID="profile-firstname" />
            <Field label={t("profile.lastName")} value={lastName} onChange={setLastName} testID="profile-lastname" />
            <Field
              label={t("profileMore.username")}
              value={username}
              onChange={setUsername}
              testID="profile-username"
              autoCapitalize="none"
            />
            <Text variant="caption" tone="muted" style={{ marginTop: -metrics.space.md }}>
              {t("profileMore.usernameHint")}
            </Text>
            <Field
              label={t("profileMore.birthDate")}
              value={birthDate}
              onChange={setBirthDate}
              placeholder={t("profileMore.birthDatePlaceholder")}
              testID="profile-birthdate"
              autoCapitalize="none"
            />
            {birthDateBad ? (
              <Text testID="profile-birthdate-error" tone="danger" variant="caption">
                {t("profileMore.birthDateInvalid")}
              </Text>
            ) : null}
            <Field
              label={t("profile.about")}
              value={about}
              onChange={setAbout}
              placeholder={t("profile.aboutPlaceholder")}
              testID="profile-about"
              autoCapitalize="none"
            />

            {/* ── Locked, and it says why ──────────────────────────────────
                Not a disabled-looking field with no explanation, which reads
                as a bug. See this file's header. */}
            <View style={{ gap: metrics.space.xs }}>
              <Text variant="caption" tone="muted">
                {t("profile.email")}
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
              <Pressable
                testID="profile-change-email"
                onPress={() => router.push("/change-email")}
                accessibilityRole="button"
                style={{ minHeight: metrics.touch, justifyContent: "center" }}
              >
                <Text tone="accent" variant="label">
                  {t("profileMore.changeEmail")}
                </Text>
              </Pressable>
            </View>
          </View>

          {failure ? (
            <Text testID="profile-error" tone="danger" variant="caption" style={{ marginTop: metrics.space.md }}>
              {failure}
            </Text>
          ) : saved ? (
            <Text testID="profile-saved" tone="accent" variant="caption" style={{ marginTop: metrics.space.md }}>
              {t("common.saved")}
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
                username: username.trim(),
                birth_date: birthDate.trim(),
              });
            }}
            disabled={saveOff}
            accessibilityRole="button"
            accessibilityLabel={t("common.save")}
            accessibilityState={{ disabled: saveOff }}
            style={{
              marginTop: metrics.space.lg,
              minHeight: metrics.touch,
              borderRadius: metrics.radius.md,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: saveOff ? colors.surface : colors.accent,
            }}
          >
            <Text variant="label" style={{ color: saveOff ? colors.inkMuted : colors.onAccent }}>
              {save.isPending ? t("common.saving") : t("common.save")}
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
              { key: "password", label: t("profile.changePassword"), to: "/change-password" as const },
              { key: "keys", label: t("profile.yourAiKey"), to: "/ai-keys" as const },
              // The PIN's settings live on the web's profile too (SafezonePinSettings.tsx).
              { key: "safezone", label: t("profile.safezonePin"), to: "/safezone/settings" as const },
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

          {/* ── The rest of the account, as the web's profile has it ─────── */}
          <View style={{ marginTop: metrics.space.lg }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: metrics.radius.md, overflow: "hidden" }}>
              <LinkRow first testID="profile-security" label={t("profileMore.security")} onPress={() => router.push("/security")} />
              <LinkRow testID="profile-api-keys" label={t("profileMore.apiKeys")} onPress={() => router.push("/api-keys")} />
              <LinkRow testID="profile-connect-claude" label={t("profileMore.connectClaude")} onPress={() => router.push("/connect-claude")} />
              <LinkRow
                testID="profile-followers"
                label={t("profileMore.followers", { count: profile.followersCount ?? 0 })}
                onPress={() => router.push("/follows?tab=followers")}
              />
              <LinkRow
                testID="profile-following"
                label={t("profileMore.following", { count: profile.followingCount ?? 0 })}
                onPress={() => router.push("/follows?tab=following")}
              />
            </View>
          </View>

          <PhotoSheet
            visible={coverSheetOpen}
            hasPhoto={Boolean(profile.coverPhoto)}
            onPicked={(picked) => {
              setSaved(false);
              cover.set.mutate(picked);
            }}
            onRemove={() => {
              setSaved(false);
              cover.clear.mutate();
            }}
            onClose={() => setCoverSheetOpen(false)}
          />

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
