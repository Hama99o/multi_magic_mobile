/**
 * Change password — `docs/design/profile/SPEC.md` §2.2-2.3.
 *
 * ── A WRONG CURRENT PASSWORD MUST NOT SIGN YOU OUT ────────────────────────
 * The server answers it with **422, not 401**, and says why in its own comment:
 * *"a typo in the current password is a validation failure. The client treats
 * every 401 as an expired session and signs the user out."* This client does
 * exactly that. So `profileApi.changePassword` turns that one 422 into
 * `WrongCurrentPassword`, and this screen renders it against the field — the
 * session is untouched, which is the whole point of the server's choice.
 *
 * ── THREE FIELDS, BECAUSE THE TYPO YOU CANNOT SEE LOCKS YOU OUT ───────────
 * The six references split three-all on a confirmation field. We take it: the
 * server checks `password_confirmation`, and a mistyped new password with no
 * confirmation locks somebody out of their own account without ever showing
 * them either copy of what they typed.
 *
 * ── AND ONE RULE, BECAUSE THERE IS ONLY ONE ───────────────────────────────
 * My BMW ticks five rules live and Origin lists five statically. Both would be
 * **wrong here**: `config/initializers/devise.rb:185` is
 * `config.password_length = 6..128`, and that is the only rule this server
 * enforces. Rendering five would reject passwords the server accepts — a client
 * inventing a policy the backend does not have.
 */
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft, Eye, EyeOff } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import {
  PASSWORD_MIN_LENGTH,
  WrongCurrentPassword,
  profileApi,
} from "@/api/profile";
import { apiErrorMessage, isNetworkFailure } from "@/api/http";

function SecretField({
  label,
  value,
  onChange,
  testID,
  invalid = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  testID: string;
  invalid?: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const [shown, setShown] = useState(false);

  return (
    <View style={{ gap: metrics.space.xs }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: invalid ? colors.danger : colors.border,
          borderRadius: metrics.radius.md,
          paddingHorizontal: metrics.space.lg,
          minHeight: metrics.touch,
        }}
      >
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={label}
          style={{ flex: 1, color: colors.ink, fontSize: 16 }}
        />
        {/* Five of six references have this, and it is the only defence
            against a typo you cannot see. */}
        <Pressable
          testID={`${testID}-reveal`}
          onPress={() => setShown((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={shown ? `Hide ${label}` : `Show ${label}`}
          hitSlop={8}
        >
          {shown ? (
            <EyeOff size={18} color={colors.inkMuted} />
          ) : (
            <Eye size={18} color={colors.inkMuted} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function ChangePassword() {
  const colors = useColors();
  const metrics = useMetrics();

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: profileApi.me });

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrongCurrent, setWrongCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = next.length > 0 && next.length < PASSWORD_MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit =
    !busy &&
    current.length > 0 &&
    next.length >= PASSWORD_MIN_LENGTH &&
    confirm === next;

  const submit = async () => {
    if (!canSubmit || !profile) return;
    setBusy(true);
    setError(null);
    setWrongCurrent(false);
    try {
      await profileApi.changePassword(profile.id, {
        currentPassword: current,
        password: next,
        passwordConfirmation: confirm,
      });
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      if (e instanceof WrongCurrentPassword) {
        // Against the field, and the session is untouched — see the header.
        setWrongCurrent(true);
      } else {
        setError(
          isNetworkFailure(e)
            ? "Could not reach MultiMagic. Your password was not changed."
            : (apiErrorMessage(e) ?? "Could not change your password."),
        );
      }
    } finally {
      setBusy(false);
    }
  };

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
        <Text variant="title" style={{ flex: 1, fontSize: 22 }}>
          Change password
        </Text>
      </View>

      <View style={{ gap: metrics.space.lg, marginTop: metrics.space.md }}>
        <View style={{ gap: metrics.space.xs }}>
          <SecretField
            label="Current password"
            value={current}
            onChange={(v) => {
              setCurrent(v);
              setWrongCurrent(false);
            }}
            testID="password-current"
            invalid={wrongCurrent}
          />
          {wrongCurrent ? (
            <Text testID="password-wrong-current" tone="danger" variant="caption">
              That password is not right.
            </Text>
          ) : null}
        </View>

        <View style={{ gap: metrics.space.xs }}>
          <SecretField
            label="New password"
            value={next}
            onChange={setNext}
            testID="password-new"
            invalid={tooShort}
          />
          {/* The one real rule, stated once. Not five invented ones. */}
          <Text tone={tooShort ? "danger" : "muted"} variant="caption">
            At least {PASSWORD_MIN_LENGTH} characters.
          </Text>
        </View>

        <View style={{ gap: metrics.space.xs }}>
          <SecretField
            label="Repeat new password"
            value={confirm}
            onChange={setConfirm}
            testID="password-confirm"
            invalid={mismatch}
          />
          {mismatch ? (
            <Text tone="danger" variant="caption">
              These do not match.
            </Text>
          ) : null}
        </View>
      </View>

      {error ? (
        <Text testID="password-error" tone="danger" variant="caption" style={{ marginTop: metrics.space.md }}>
          {error}
        </Text>
      ) : done ? (
        <Text testID="password-done" tone="accent" variant="caption" style={{ marginTop: metrics.space.md }}>
          Your password was changed. You are still signed in on this phone.
        </Text>
      ) : null}

      <Pressable
        testID="password-save"
        onPress={() => void submit()}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel="Change password"
        accessibilityState={{ disabled: !canSubmit }}
        style={{
          marginTop: metrics.space.xl,
          minHeight: metrics.touch,
          borderRadius: metrics.radius.md,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: canSubmit ? colors.accent : colors.surface,
        }}
      >
        <Text variant="label" style={{ color: canSubmit ? colors.onAccent : colors.inkMuted }}>
          {busy ? "Changing…" : "Change password"}
        </Text>
      </Pressable>
    </Screen>
  );
}
