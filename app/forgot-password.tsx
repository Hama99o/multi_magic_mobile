/**
 * Ask for a reset link — `PUT /api/v1/users/reset_password`.
 *
 * NOT `resources :passwords`, which is SafeZone's password VAULT. The SPEC
 * flagged that it had read the route declaration without its namespace, and it
 * was right to: wiring this screen there would have posted the user's email
 * into their own encrypted password store.
 *
 * ── The success message does not say whether the address existed ──────────
 * An app that distinguishes "sent" from "no such account" tells a stranger
 * which emails have accounts. The server already refuses to leak it —
 * `user&.reset_password!` then an unconditional `head :ok`
 * (`users_controller.rb:72-76`) — so there is no branch here to get wrong, and
 * the copy is written to match what is actually true.
 *
 * The CONFIRMATION step is deliberately not in v1: the emailed link opens the
 * web app, which already has that form.
 */
import { useState } from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { Input } from "@/components/reusables/input";
import { useMetrics } from "@/hooks/useColors";
import { requestPasswordReset } from "@/api/auth";
import { apiErrorMessage, isNetworkFailure } from "@/api/http";

export default function ForgotPassword() {
  const metrics = useMetrics();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setError(null);

    if (!email.trim()) {
      setError("Enter the email you signed up with.");
      return;
    }

    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (e) {
      setError(
        isNetworkFailure(e)
          ? "Could not reach MultiMagic. Check your connection."
          : (apiErrorMessage(e) ?? "Could not send the link."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll avoidKeyboard>
      <View style={{ flex: 1, justifyContent: "center", gap: metrics.space.xl, paddingVertical: metrics.space.xl }}>
        {sent ? (
          <View style={{ gap: metrics.space.md }} testID="forgot-password-sent">
            <Text variant="title">Check your email</Text>
            {/* Deliberately "if that address has an account". Saying "we sent
                you a link" would confirm the account exists. */}
            <Text tone="muted">
              If that address has a MultiMagic account, we have sent it a link to reset the
              password. The link opens MultiMagic on the web.
            </Text>
            <Link href="/sign-in" asChild>
              <Text tone="accent" testID="forgot-password-back">
                Back to sign in
              </Text>
            </Link>
          </View>
        ) : (
          <>
            <View style={{ gap: metrics.space.sm }}>
              <Text variant="title">Reset your password</Text>
              <Text tone="muted">
                Enter your email and we will send a link to set a new password.
              </Text>
            </View>

            <View style={{ gap: metrics.space.lg }}>
              <Input
                label="Email"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (error) setError(null);
                }}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                testID="forgot-password-email"
              />
              {error ? (
                <Text variant="caption" tone="danger" testID="forgot-password-error">
                  {error}
                </Text>
              ) : null}
            </View>

            <View style={{ gap: metrics.space.lg }}>
              <Button label="Send reset link" busy={busy} onPress={() => void submit()} testID="forgot-password-submit" />
              <View style={{ alignItems: "center" }}>
                <Link href="/sign-in" asChild>
                  <Text variant="caption" tone="muted">
                    Back to sign in
                  </Text>
                </Link>
              </View>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
