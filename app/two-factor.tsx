/**
 * THE EMAILED CODE — the half of a 2FA sign-in this app did not have.
 *
 * His words: *"it should work on mobile also — it sends code but there it did
 * not have option in mobile."* And he is describing a dead end, not a missing
 * nicety: with 2FA on his account, the server mails a code, revokes the
 * previous JWT (`sessions_controller.rb:29`) and answers 202 — and the app
 * showed the sentence "this app cannot do that yet" on a login that had
 * already succeeded. There was no way into his own account from this phone.
 *
 * ── MODELLED ON THE WEB'S SCREEN, WHICH HE ASKED FOR BY NAME ─────────────
 * `app/javascript/pages/auth/TwoFactorVerify.tsx`: six digits, the server's
 * own sentence on a bad code, a way back to sign-in, and a redirect to login
 * when no code is pending. The keyboard is numeric and the field carries the
 * one-time-code autofill hints, so the platform can offer the code from the
 * notification rather than making somebody memorise six digits and switch
 * apps to read them twice.
 *
 * ── "TRUST THIS DEVICE" — WHICH USED TO BE IMPOSSIBLE HERE ──────────────
 * It was left out on purpose at first, and the note said why:
 * `trusted_devices#create` answered by writing a COOKIE and the trust was read
 * back from that cookie, so on a client with a Bearer token and no cookie jar
 * the button would post, report success, and change nothing — the next sign-in
 * would ask for a code again with no explanation. A button that cannot work is
 * worse than no button.
 *
 * He said finish it, so the backend was finished instead: the token now comes
 * back in the BODY and the login request carries it in `X-Trusted-Device`. The
 * checks are untouched — the token is a digest at rest, bound to this device's
 * fingerprint, owned by one user and expiring — so what widened is the
 * transport and nothing else.
 *
 * It is offered AFTER verifying, never before: the choice belongs to somebody
 * who has just proved they hold the account, and "remember me" beside a code
 * field is a checkbox that weakens the step it sits next to.
 *
 * ── AND THE ATTEMPTS COUNTER IS THE SERVER'S SENTENCE, NOT OURS ──────────
 * `two_factor_controller.rb:63-66` sends `message` and `attempts_left`. Only
 * the server knows how many tries remain before the code dies, so its wording
 * is rendered rather than replaced — the same rule the dictation errors follow.
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react-native";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { Input } from "@/components/reusables/input";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useAuthStore } from "@/stores/auth.store";
import { apiErrorMessage, isNetworkFailure, isRateLimited } from "@/api/http";
import { trustThisDevice } from "@/api/auth";

/** The server mails six digits. Anything else is not worth a round trip. */
const CODE_LENGTH = 6;

function messageFor(error: unknown, t: (key: string) => string): string {
  if (isRateLimited(error)) return t("signIn.tooManyAttempts");
  if (isNetworkFailure(error)) return t("failure.checkConnection");
  // The server's own words when it has them — it is the only party that knows
  // whether the code was wrong, expired, or the last attempt.
  return apiErrorMessage(error) ?? t("twoFactor.invalidCode");
}

export default function TwoFactor() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const pending = useAuthStore((s) => s.pendingTwoFactor);
  const verify = useAuthStore((s) => s.verifyTwoFactor);
  const clearTwoFactor = useAuthStore((s) => s.clearTwoFactor);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Verified, and now asking whether to remember this phone. */
  const [verified, setVerified] = useState(false);
  const [trusting, setTrusting] = useState(false);

  /**
   * Nothing pending means nothing to spend — the same guard the web screen
   * opens with. Arriving here with no token (a deep link, a reload, a code
   * already used) must go back to sign-in rather than ask for digits that
   * cannot be verified.
   */
  useEffect(() => {
    // Not once verified: the token is spent by then, and bouncing somebody out
    // of the screen that is about to offer them a choice is the bug this guard
    // would otherwise introduce.
    if (!pending && !verified) router.replace("/sign-in");
  }, [pending, verified]);

  async function submit() {
    if (busy) return;
    setError(null);

    // Checked on press rather than on keystroke, for the reason the sign-in
    // screen gives: a control that refuses without saying why is the commonest
    // reason somebody decides a login is broken.
    if (code.trim().length !== CODE_LENGTH) {
      setError(t("twoFactor.codeInvalid"));
      return;
    }

    setBusy(true);
    try {
      await verify(code);
      setVerified(true);
    } catch (e) {
      setError(messageFor(e, t));
    } finally {
      setBusy(false);
    }
  }

  function backToSignIn() {
    clearTwoFactor();
    router.replace("/sign-in");
  }

  /**
   * Either answer ends on the assistant. Trusting can fail — the network, a
   * fingerprint the server did not get — and it costs a code next time and
   * nothing else, so it is never a reason to hold somebody on this screen.
   */
  async function remember(trust: boolean) {
    if (trusting) return;
    if (!trust) {
      router.replace("/chat");
      return;
    }
    setTrusting(true);
    await trustThisDevice();
    setTrusting(false);
    router.replace("/chat");
  }

  if (verified) {
    return (
      <Screen measure scroll>
        <View
          style={{
            flex: 1,
            gap: metrics.space.xl,
            paddingTop: metrics.space.xl * 2,
            paddingBottom: metrics.space.xl,
          }}
          testID="two-factor-verified"
        >
          <View style={{ gap: metrics.space.sm }}>
            <ShieldCheck size={28} color={colors.accent} />
            <Text variant="title">{t("twoFactor.verified")}</Text>
            <Text tone="muted">{t("twoFactor.trustDeviceDesc")}</Text>
          </View>

          <Button
            label={t("twoFactor.trustDevice")}
            busy={trusting}
            onPress={() => void remember(true)}
            testID="two-factor-trust"
          />

          <View style={{ alignItems: "center" }}>
            <Text
              variant="caption"
              tone="accent"
              onPress={() => void remember(false)}
              accessibilityRole="button"
              accessibilityLabel={t("twoFactor.notNow")}
              testID="two-factor-not-now"
            >
              {t("twoFactor.notNow")}
            </Text>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen measure scroll avoidKeyboard>
      <View
        style={{
          flex: 1,
          gap: metrics.space.xl,
          paddingTop: metrics.space.xl * 2,
          paddingBottom: metrics.space.xl,
        }}
      >
        <View style={{ gap: metrics.space.sm }}>
          {/* The web leads with this mark and it earns its place: it says the
              interruption is a security step rather than a failure. */}
          <ShieldCheck size={28} color={colors.accent} />
          <Text variant="title">{t("twoFactor.title")}</Text>
          <Text tone="muted">{t("twoFactor.subtitle")}</Text>
        </View>

        <View style={{ gap: metrics.space.xs }}>
          <Input
            label={t("twoFactor.codeLabel")}
            value={code}
            onChangeText={(next) => {
              // Digits only, and never longer than the code itself: a pasted
              // "Code: 123456" should leave the six that matter.
              setCode(next.replace(/\D/g, "").slice(0, CODE_LENGTH));
              if (error) setError(null);
            }}
            keyboardType="number-pad"
            autoCapitalize="none"
            // The platform's one-time-code autofill: iOS reads it from the
            // mail notification, Android from an SMS-shaped message. Without
            // these the code has to be memorised and typed between two apps.
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={CODE_LENGTH}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            testID="two-factor-code"
          />

          {error ? (
            <Text variant="caption" tone="danger" testID="two-factor-error">
              {error}
            </Text>
          ) : null}
        </View>

        <Button
          label={t("twoFactor.submit")}
          busy={busy}
          onPress={() => void submit()}
          testID="two-factor-submit"
        />

        <View style={{ alignItems: "center" }}>
          <Text
            variant="caption"
            tone="accent"
            onPress={backToSignIn}
            accessibilityRole="button"
            accessibilityLabel={t("twoFactor.backToSignIn")}
            testID="two-factor-back"
          >
            {t("twoFactor.backToSignIn")}
          </Text>
        </View>
      </View>
    </Screen>
  );
}
