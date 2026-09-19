/**
 * Sign in — `docs/design/sign-in/SPEC.md`.
 *
 * The shape is Preply's (title, labelled fields, eye in the password, one
 * filled primary, "Forgot your password?" centred beneath), with Upside's
 * "New here? Create an account" above the button and GoPro's rule that a
 * button says what it does when it is the only method.
 *
 * ── The decision the references disagreed on ──────────────────────────────
 * The primary is **enabled from the start and validates on press**, rather than
 * staying disabled until the fields look right. A disabled button with no
 * explanation is the commonest reason somebody thinks a login is broken, and
 * email validity is not worth being strict about before the server has spoken.
 */
import { useState } from "react";
import { View } from "react-native";
import { Link, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { Input } from "@/components/reusables/input";
import { useMetrics } from "@/hooks/useColors";
import { sessionEndSentence, useAuthStore } from "@/stores/auth.store";
import { TwoFactorRequiredError } from "@/api/auth";
import { apiErrorMessage, isNetworkFailure, isRateLimited, isUnauthorized } from "@/api/http";

/**
 * One sentence per failure, and they are different sentences on purpose.
 *
 * A 429 must never read as "wrong password": it is both untrue and the more
 * alarming of the two, and it sends someone to reset a password that was
 * always correct. A network failure must never read as a credential problem
 * either — Karwan shipped "check your connection" on a 401 and people went and
 * restarted their routers.
 */
function messageFor(error: unknown, t: (key: string) => string): string {
  if (error instanceof TwoFactorRequiredError) return error.message;
  if (isRateLimited(error)) return t("signIn.tooManyAttempts");
  if (isUnauthorized(error)) return t("signIn.wrongCredentials");
  if (isNetworkFailure(error)) return t("failure.checkConnection");
  return apiErrorMessage(error) ?? t("signIn.failed");
}

export default function SignIn() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const signIn = useAuthStore((s) => s.signIn);
  const signedOutReason = useAuthStore((s) => s.signedOutReason);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setError(null);

    // Validated on press, not on keystroke — see the header.
    if (!email.trim() || !password) {
      setError(t("signIn.missing"));
      return;
    }

    setBusy(true);
    try {
      await signIn({ email, password });
      router.replace("/chat");
    } catch (e) {
      setError(messageFor(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll avoidKeyboard>
      {/* Anchored near the top rather than vertically centred. `justifyContent:
          "center"` left a quarter of a 2400 px screen as empty sky above the
          title — calm in a screenshot, slightly abandoned in a hand. */}
      <View style={{ flex: 1, gap: metrics.space.xl, paddingTop: metrics.space.xl * 2, paddingBottom: metrics.space.xl }}>
        <View style={{ gap: metrics.space.sm }}>
          <Text variant="title">{t("signIn.title")}</Text>
          <Text tone="muted">{t("signIn.subtitle")}</Text>
          {/* Only after a FORCED sign-out. Arriving here from a 401 with no
              sentence looks like the app forgot you; arriving here because the
              device check failed deserves to be told so in words. */}
          {signedOutReason ? (
            <Text variant="caption" tone="accent" testID="sign-in-notice">
              {sessionEndSentence(signedOutReason)}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: metrics.space.lg }}>
          <Input
            label={t("signIn.email")}
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (error) setError(null);
            }}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            testID="sign-in-email"
          />

          <View style={{ gap: metrics.space.xs }}>
            <Input
              label={t("signIn.password")}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (error) setError(null);
              }}
              secure
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              testID="sign-in-password"
            />

            {/* Directly under the password, where the need actually arises, and
                in the ACCENT. A muted-grey recovery link is an affordance that
                denies being one — and this is the link somebody reaches for at
                the moment they are already stuck. */}
            <View style={{ alignItems: "flex-end" }}>
              <Link href="/forgot-password" asChild>
                <Text variant="caption" tone="accent" testID="sign-in-forgot">
                  {t("signIn.forgot")}
                </Text>
              </Link>
            </View>
          </View>

          {error ? (
            <Text variant="caption" tone="danger" testID="sign-in-error">
              {error}
            </Text>
          ) : null}
        </View>

        {/* GoPro's rule: the button says what it does, because it is the only
            method on offer. */}
        <Button
          label={t("signIn.submit")}
          busy={busy}
          onPress={() => void submit()}
          testID="sign-in-submit"
        />

        {/* The alternative DESTINATION, not a recovery path — so it sits apart
            from the form, at the bottom, and is differentiated from the link
            above by position rather than by colour. */}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: metrics.space.xs }}>
          <Text variant="caption" tone="muted">
            {t("signIn.newHere")}
          </Text>
          <Link href="/sign-up" asChild>
            <Text variant="caption" tone="accent" testID="sign-in-create-account">
              {t("signIn.createAccount")}
            </Text>
          </Link>
        </View>
      </View>
    </Screen>
  );
}
