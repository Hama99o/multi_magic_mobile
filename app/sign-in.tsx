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
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { Input } from "@/components/reusables/input";
import { useMetrics } from "@/hooks/useColors";
import { useAuthStore } from "@/stores/auth.store";
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
function messageFor(error: unknown): string {
  if (error instanceof TwoFactorRequiredError) return error.message;
  if (isRateLimited(error)) return "Too many attempts. Try again in a few minutes.";
  if (isUnauthorized(error)) return "That email and password do not match.";
  if (isNetworkFailure(error)) return "Could not reach MultiMagic. Check your connection.";
  return apiErrorMessage(error) ?? "Something went wrong signing in.";
}

export default function SignIn() {
  const metrics = useMetrics();
  const signIn = useAuthStore((s) => s.signIn);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setError(null);

    // Validated on press, not on keystroke — see the header.
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setBusy(true);
    try {
      await signIn({ email, password });
      router.replace("/chat");
    } catch (e) {
      setError(messageFor(e));
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
          <Text variant="title">Sign in</Text>
          <Text tone="muted">Your notes, money, contacts and calendar — answered.</Text>
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
            textContentType="emailAddress"
            returnKeyType="next"
            testID="sign-in-email"
          />

          <View style={{ gap: metrics.space.xs }}>
            <Input
              label="Password"
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
                  Forgot your password?
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
          label="Sign in with email"
          busy={busy}
          onPress={() => void submit()}
          testID="sign-in-submit"
        />

        {/* The alternative DESTINATION, not a recovery path — so it sits apart
            from the form, at the bottom, and is differentiated from the link
            above by position rather than by colour. */}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: metrics.space.xs }}>
          <Text variant="caption" tone="muted">
            New here?
          </Text>
          <Link href="/sign-up" asChild>
            <Text variant="caption" tone="accent" testID="sign-in-create-account">
              Create an account
            </Text>
          </Link>
        </View>
      </View>
    </Screen>
  );
}
