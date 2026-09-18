/**
 * Create an account — his instruction of 18 Sept.
 *
 * **Its own screen, not a toggle on sign-in.** A form that changes what its
 * fields mean under the same title is the commonest way people submit the wrong
 * one — that is the SPEC's decision and this file is why it is cheap to keep.
 *
 * `POST /users/signup` takes `firstname`/`lastname` — one word, no underscore.
 */
import { useState } from "react";
import { View } from "react-native";
import { Link, router } from "expo-router";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { Input } from "@/components/reusables/input";
import { useMetrics } from "@/hooks/useColors";
import { signUp } from "@/api/auth";
import { useAuthStore } from "@/stores/auth.store";
import { apiErrorMessage, isNetworkFailure } from "@/api/http";

/**
 * Devise answers a bad signup with 400 and a JSON:API-ish `errors` array
 * (`registrations_controller.rb:20-27`), not the `{ error: "..." }` shape the
 * rest of the API uses. Reading only the common shape would show "something
 * went wrong" for "Email has already been taken", which is the one failure the
 * user can actually act on.
 */
function messageFor(error: unknown): string {
  if (isNetworkFailure(error)) return "Could not reach MultiMagic. Check your connection.";

  const data = (error as { response?: { data?: unknown } })?.response?.data;
  const errors = (data as { errors?: unknown })?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const details = errors
      .map((e) => (e as { detail?: unknown }).detail)
      .filter((d): d is string => typeof d === "string");
    if (details.length > 0) return details.join(". ");
  }

  return apiErrorMessage(error) ?? "Could not create that account.";
}

export default function SignUp() {
  const metrics = useMetrics();

  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setError(null);

    if (!firstname.trim() || !email.trim() || !password) {
      setError("Fill in your name, email and a password.");
      return;
    }

    setBusy(true);
    try {
      const user = await signUp({ firstname, lastname, email, password });
      // Devise signs the new account in, so this lands in the app rather than
      // back at a login the user has just proved they can pass.
      useAuthStore.setState({ user, status: "signedIn" });
      router.replace("/chat");
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll avoidKeyboard>
      <View style={{ flex: 1, justifyContent: "center", gap: metrics.space.xl, paddingVertical: metrics.space.xl }}>
        <View style={{ gap: metrics.space.sm }}>
          <Text variant="title">Create an account</Text>
          <Text tone="muted">One account for your notes, money, contacts and calendar.</Text>
        </View>

        <View style={{ gap: metrics.space.lg }}>
          <Input
            label="First name"
            value={firstname}
            onChangeText={setFirstname}
            autoCapitalize="words"
            autoComplete="given-name"
            testID="sign-up-firstname"
          />
          <Input
            label="Last name"
            value={lastname}
            onChangeText={setLastname}
            autoCapitalize="words"
            autoComplete="family-name"
            testID="sign-up-lastname"
          />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            testID="sign-up-email"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secure
            autoCapitalize="none"
            autoComplete="new-password"
            testID="sign-up-password"
          />

          {error ? (
            <Text variant="caption" tone="danger" testID="sign-up-error">
              {error}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: metrics.space.lg }}>
          <Button label="Create account" busy={busy} onPress={() => void submit()} testID="sign-up-submit" />
          <View style={{ flexDirection: "row", justifyContent: "center", gap: metrics.space.xs }}>
            <Text variant="caption" tone="muted">
              Already have an account?
            </Text>
            <Link href="/sign-in" asChild>
              <Text variant="caption" tone="accent" testID="sign-up-to-sign-in">
                Sign in
              </Text>
            </Link>
          </View>
        </View>
      </View>
    </Screen>
  );
}
