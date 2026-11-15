/**
 * Change the SafeZone PIN, or turn it off, as the web does
 * (`profile/components/SafezonePinSettings.tsx`, `PinController`):
 * - change: the account password → `POST /pin/request_change` emails a
 *   6-digit code → `POST /pin/confirm_change {code, pin, pin_confirmation}`.
 *   It is also the way back from a forgotten PIN (the gate's "Forgot your
 *   PIN?"), since it never asks for the old one. The server kills every unlock
 *   token with the old PIN, so the vault locks here too;
 * - turn off: the account password → `DELETE /pin/disable`.
 *
 * SECURITY.md §1: the PIN, the code and the password are this form's state
 * and nothing else. They are sent as arguments, not as React Query mutation
 * variables (the mutation cache would keep them for minutes), they are
 * emptied the moment the server accepts, and leaving the form drops them.
 */
import { useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { safezoneApi, SafeZoneError } from "@/api/safezone";
import { failureMessage } from "@/api/failure";
import { useSafezoneLock } from "@/stores/safezoneLock.store";

const SIX_DIGITS = /^\d{6}$/;
const digits = (v: string) => v.replace(/\D/g, "");

/** The server's refusals, in the words the web uses. */
function refusalText(e: unknown, t: (key: string) => string, fallback: string): string {
  if (e instanceof SafeZoneError) {
    if (e.kind === "invalidPassword") return t("safezone.setup.badPassword");
    if (e.kind === "invalidCode") return t("safezone.change.badCode");
    if (e.kind === "pinMismatch") return t("safezone.setup.mismatch");
    if (e.kind === "invalidFormat") return t("safezone.setup.format");
    if (e.kind === "rateLimited") return t("safezone.change.rateLimited");
  }
  return failureMessage(e, t(fallback));
}

function useFieldStyle() {
  const colors = useColors();
  const metrics = useMetrics();
  return {
    color: colors.ink,
    fontSize: 16,
    minHeight: metrics.touch,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: metrics.radius.md,
    paddingHorizontal: metrics.space.md,
    backgroundColor: colors.surface,
  };
}

/** A secret field: no autofill, no suggestions, no learning (SECURITY.md §1). */
const SECRET = { secureTextEntry: true, autoCorrect: false, autoCapitalize: "none" as const, importantForAutofill: "no" as const, contextMenuHidden: true };

function ErrorLine({ text, testID }: { text: string | null; testID: string }) {
  if (!text) return null;
  return (
    <Text testID={testID} tone="danger" accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}

export function ChangePinForm({ intro, onDone, onCancel }: { intro: string; onDone: () => void; onCancel: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const field = useFieldStyle();
  const { t } = useTranslation();
  const [step, setStep] = useState<"password" | "code">("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = () => {
    setBusy(true);
    setError(null);
    safezoneApi
      .requestChange(password)
      .then(() => {
        setPassword(""); // the code step does not need it again
        setStep("code");
      })
      .catch((e: unknown) => setError(refusalText(e, t, "safezone.change.failed")))
      .finally(() => setBusy(false));
  };

  const confirm = () => {
    if (!SIX_DIGITS.test(pin)) return setError(t("safezone.setup.format"));
    if (pin !== again) return setError(t("safezone.setup.mismatch"));
    setBusy(true);
    setError(null);
    safezoneApi
      .confirmChange({ code, pin, pinConfirmation: again })
      .then(() => {
        setCode("");
        setPin("");
        setAgain("");
        setBusy(false);
        // The server has killed every token issued under the old PIN.
        useSafezoneLock.getState().lock();
        onDone();
      })
      .catch((e: unknown) => {
        setBusy(false);
        setError(refusalText(e, t, "safezone.change.failed"));
      });
  };

  const cancel = () => {
    setPassword("");
    setCode("");
    setPin("");
    setAgain("");
    onCancel();
  };

  return (
    <View testID="safezone-change" style={{ gap: metrics.space.md, alignSelf: "stretch" }}>
      <Text variant="title" accessibilityRole="header">
        {t("safezone.change.title")}
      </Text>
      {step === "password" ? (
        <>
          <Text tone="muted">{intro}</Text>
          <TextInput testID="safezone-change-password" value={password} onChangeText={setPassword} autoComplete="current-password" placeholder={t("safezone.setup.password")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("safezone.setup.password")} style={field} secureTextEntry autoCorrect={false} autoCapitalize="none" />
          <ErrorLine text={error} testID="safezone-change-error" />
          <Button testID="safezone-change-send" label={t("safezone.change.sendCode")} onPress={sendCode} busy={busy} disabled={busy || !password} />
        </>
      ) : (
        <>
          <Text tone="muted">{t("safezone.change.codeSent")}</Text>
          <TextInput testID="safezone-change-code" value={code} onChangeText={(v) => setCode(digits(v))} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" placeholder={t("safezone.change.code")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("safezone.change.code")} style={field} autoCorrect={false} />
          <TextInput testID="safezone-change-pin" value={pin} onChangeText={(v) => setPin(digits(v))} keyboardType="number-pad" maxLength={6} autoComplete="off" placeholder={t("safezone.setup.pin")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("safezone.setup.pin")} style={field} {...SECRET} />
          <TextInput testID="safezone-change-again" value={again} onChangeText={(v) => setAgain(digits(v))} keyboardType="number-pad" maxLength={6} autoComplete="off" placeholder={t("safezone.setup.confirm")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("safezone.setup.confirm")} style={field} {...SECRET} />
          <ErrorLine text={error} testID="safezone-change-error" />
          <Button testID="safezone-change-confirm" label={t("safezone.change.save")} onPress={confirm} busy={busy} disabled={busy || code.length !== 6 || !pin || !again} />
        </>
      )}
      <Button testID="safezone-change-cancel" label={t("common.cancel")} tone="neutral" onPress={cancel} disabled={busy} />
    </View>
  );
}

export function TurnOffPinForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const field = useFieldStyle();
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const turnOff = () => {
    setBusy(true);
    setError(null);
    safezoneApi
      .disable(password)
      .then((status) => {
        setPassword("");
        setBusy(false);
        const lock = useSafezoneLock.getState();
        lock.lock(); // wipes what is open (lists, clipboard, revealed fields)
        lock.fromPinStatus(status);
        onDone();
      })
      .catch((e: unknown) => {
        setBusy(false);
        setError(refusalText(e, t, "safezone.disable.failed"));
      });
  };

  return (
    <View testID="safezone-disable" style={{ gap: metrics.space.md }}>
      <Text variant="title" accessibilityRole="header">
        {t("safezone.disable.title")}
      </Text>
      <Text testID="safezone-disable-body" tone="muted">
        {t("safezone.disable.body")}
      </Text>
      <TextInput testID="safezone-disable-password" value={password} onChangeText={setPassword} autoComplete="current-password" placeholder={t("safezone.setup.password")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("safezone.setup.password")} style={field} secureTextEntry autoCorrect={false} autoCapitalize="none" />
      <ErrorLine text={error} testID="safezone-disable-error" />
      <Button testID="safezone-disable-confirm" label={t("safezone.disable.confirm")} tone="danger" onPress={turnOff} busy={busy} disabled={busy || !password} />
      <Button
        testID="safezone-disable-cancel"
        label={t("common.cancel")}
        tone="neutral"
        onPress={() => {
          setPassword("");
          onCancel();
        }}
        disabled={busy}
      />
    </View>
  );
}
