/**
 * Change the email you sign in with — MANIFEST row 25.
 *
 * Two steps, both decided on the server (multi_magic, `users/me/email_change`):
 * the current password and the new address, which receives a six-digit code;
 * then the code. Until the code is accepted nothing has changed, so a typo in
 * the new address cannot lock anybody out of their own account.
 *
 * ── THE SOCKET READS THE EMAIL ────────────────────────────────────────────
 * `ApplicationCable::Connection` finds the user by the email in the socket's
 * query string (`src/api/profile.ts` header). So the moment the server
 * accepts the code, the stored session email is replaced in the same step,
 * before anything can reconnect with the old one.
 */
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Input } from "@/components/reusables/input";
import { Button } from "@/components/reusables/button";
import { useMetrics } from "@/hooks/useColors";
import { failureMessage } from "@/api/failure";
import { setSessionEmail } from "@/api/http";
import { profileKeys } from "@/api/keys";
import { profileApi, WrongCurrentPassword, type Profile } from "@/api/profile";
import { EmailChangeRefused, securityApi } from "@/api/security";
import { AccountHeader } from "@/components/settings/AccountUi";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ChangeEmail() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const me = useQuery({ queryKey: profileKeys.me(), queryFn: profileApi.me });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<{ email: string; minutes: number } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: "email" | "password" | "code"; text: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const refusal = (e: unknown): string | null => {
    if (e instanceof WrongCurrentPassword) return t("changeEmail.wrongPassword");
    if (!(e instanceof EmailChangeRefused)) return null;
    switch (e.code) {
      case "invalid_email":
        return t("changeEmail.invalidEmail");
      case "same_email":
        return t("changeEmail.sameEmail");
      case "email_taken":
        return t("changeEmail.emailTaken");
      case "invalid_code":
        return t("changeEmail.invalidCode", { count: e.attemptsLeft ?? 0 });
      case "too_many_attempts":
        return t("changeEmail.tooManyAttempts");
      case "no_pending_change":
        return t("changeEmail.noPendingChange");
      default:
        return null;
    }
  };

  const fail = (e: unknown, field: "email" | "password" | "code") => {
    const text = refusal(e);
    if (text) {
      const where = e instanceof WrongCurrentPassword ? "password" : field;
      setFieldError({ field: where, text });
      setFailure(null);
    } else {
      setFieldError(null);
      setFailure(failureMessage(e, t("changeEmail.failed")));
    }
  };

  // Closures, not variables: the password must not sit in React Query's cache.
  const request = useMutation({
    mutationFn: () => securityApi.requestEmailChange(password, email.trim()),
    onSuccess: ({ expiresInMinutes }) => {
      setSent({ email: email.trim(), minutes: expiresInMinutes });
      setPassword("");
      setFieldError(null);
      setFailure(null);
    },
    onError: (e) => fail(e, "email"),
  });

  const confirm = useMutation({
    mutationFn: () => securityApi.confirmEmailChange(code.trim()),
    onSuccess: async ({ email: confirmed }) => {
      const now = confirmed ?? sent?.email ?? null;
      if (now) await setSessionEmail(now);
      client.setQueryData<Profile>(profileKeys.me(), (p) => (p ? { ...p, email: now } : p));
      setDone(now);
      setCode("");
      setFieldError(null);
      setFailure(null);
    },
    onError: (e) => fail(e, "code"),
  });

  const errorFor = (field: "email" | "password" | "code") => (fieldError?.field === field ? fieldError.text : null);

  return (
    <Screen measure scroll avoidKeyboard>
      <AccountHeader title={t("changeEmail.title")} />
      <View style={{ gap: metrics.space.lg }}>
        <Text variant="caption" tone="muted" testID="change-email-current">
          {t("changeEmail.current", { email: me.data?.email ?? "—" })}
        </Text>

        {done ? (
          <>
            <Text testID="change-email-done" tone="accent">
              {t("changeEmail.done", { email: done })}
            </Text>
            <Button testID="change-email-close" label={t("changeEmail.close")} onPress={() => router.back()} />
          </>
        ) : sent ? (
          <>
            <Text testID="change-email-sent">{t("changeEmail.codeSent", { email: sent.email, minutes: sent.minutes })}</Text>
            <Input
              testID="change-email-code"
              label={t("changeEmail.code")}
              value={code}
              onChangeText={(next) => {
                setCode(next.replace(/\D/g, "").slice(0, 6));
                setFieldError(null);
              }}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              error={errorFor("code")}
              errorTestID="change-email-code-error"
            />
            {failure ? (
              <Text testID="change-email-error" tone="danger" variant="caption">
                {failure}
              </Text>
            ) : null}
            <Button
              testID="change-email-confirm"
              label={confirm.isPending ? t("changeEmail.confirming") : t("changeEmail.confirm")}
              busy={confirm.isPending}
              disabled={code.length !== 6}
              onPress={() => confirm.mutate()}
            />
            <Button
              testID="change-email-restart"
              label={t("changeEmail.startOver")}
              tone="neutral"
              onPress={() => {
                setSent(null);
                setCode("");
                setFieldError(null);
                setFailure(null);
              }}
            />
          </>
        ) : (
          <>
            <Input
              testID="change-email-new"
              label={t("changeEmail.newEmail")}
              value={email}
              onChangeText={(next) => {
                setEmail(next);
                setFieldError(null);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              error={errorFor("email")}
              errorTestID="change-email-new-error"
            />
            <Input
              testID="change-email-password"
              label={t("changeEmail.password")}
              value={password}
              onChangeText={(next) => {
                setPassword(next);
                setFieldError(null);
              }}
              secure
              autoComplete="current-password"
              error={errorFor("password")}
              errorTestID="change-email-password-error"
            />
            {failure ? (
              <Text testID="change-email-error" tone="danger" variant="caption">
                {failure}
              </Text>
            ) : null}
            <Button
              testID="change-email-send"
              label={request.isPending ? t("changeEmail.sending") : t("changeEmail.send")}
              busy={request.isPending}
              disabled={!EMAIL.test(email.trim()) || password.length === 0}
              onPress={() => request.mutate()}
            />
          </>
        )}
      </View>
    </Screen>
  );
}
