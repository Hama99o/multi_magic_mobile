/**
 * The door to SafeZone (`SPEC.md` §C.1, `SECURITY.md` §2–§4, §7). It renders
 * its children only while the vault is unlocked. Otherwise it renders Set a
 * PIN, the PIN pad, or the server's lockout.
 *
 * It also enforces the locking rules while any SafeZone screen is open:
 * - background → `lock()`; `inactive` (the app switcher) → a cover;
 * - back to `active` → an overdue clipboard clear, and the token's expiry
 *   checked;
 * - a tick every 5 s locks an expired token;
 * - a touch past the token's half-life asks the server to slide it;
 * - `lockOnLeave` (the vault's root screen): leaving SafeZone locks it.
 * And it keeps screen capture blocked (`useSecureScreen`).
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Lock } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { safezoneApi, SafeZoneError } from "@/api/safezone";
import { failureMessage } from "@/api/failure";
import { onSafezoneLock, useSafezoneLock } from "@/stores/safezoneLock.store";
import { clipboardGuard } from "./clipboardGuard";
import { formatCountdown, lockoutLeft, PIN_LENGTH } from "./pin";
import { PinPad } from "./PinPad";
import { useSecureScreen } from "./secureScreen";

const TICK_MS = 5_000;
const RATE_LIMIT_MS = 60_000;

export function SafeZoneGate({ children, lockOnLeave = false }: { children: ReactNode; lockOnLeave?: boolean }) {
  const status = useSafezoneLock((s) => s.status);
  const queryClient = useQueryClient();
  const [covered, setCovered] = useState(false);
  const [statusError, setStatusError] = useState<unknown>(null);

  useSecureScreen("safezone");

  const loadStatus = useCallback(() => {
    setStatusError(null);
    safezoneApi
      .pinStatus()
      .then((pin) => useSafezoneLock.getState().fromPinStatus(pin))
      .catch((e: unknown) => setStatusError(e));
  }, []);

  useEffect(() => {
    if (useSafezoneLock.getState().status.kind !== "unlocked") loadStatus();
  }, [loadStatus]);

  // Locking drops even the stripped lists.
  useEffect(() => onSafezoneLock(() => queryClient.removeQueries({ queryKey: ["safezone"] })), [queryClient]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      setCovered(next === "inactive");
      if (next === "background") useSafezoneLock.getState().lock();
      if (next === "active") {
        void clipboardGuard.clearIfDue();
        useSafezoneLock.getState().expireIfDue();
      }
    });
    const tick = setInterval(() => useSafezoneLock.getState().expireIfDue(), TICK_MS);
    return () => {
      sub.remove();
      clearInterval(tick);
    };
  }, []);

  useEffect(
    () => () => {
      if (lockOnLeave) useSafezoneLock.getState().lock();
    },
    [lockOnLeave],
  );

  const touch = () => {
    const lock = useSafezoneLock.getState();
    const token = lock.liveToken();
    if (!token || !lock.needsRefresh()) return;
    safezoneApi
      .refresh(token)
      .then((grant) => useSafezoneLock.getState().unlocked(grant))
      .catch(() => {
        // A refused refresh has already locked the vault (safezone_pin_locked);
        // a network failure leaves the token to expire on its own.
      });
  };

  let body: ReactNode;
  if (status.kind === "unlocked") body = children;
  else if (status.kind === "notEnabled") body = <SetUpPin onDone={loadStatus} />;
  else if (status.kind === "lockedOut") body = <LockedOut until={status.until} onOver={loadStatus} />;
  else if (status.kind === "locked") body = <Unlock attemptsLeft={status.attemptsLeft} />;
  else body = <Checking error={statusError} onRetry={loadStatus} />;

  return (
    <View style={{ flex: 1 }} onTouchStart={touch}>
      {body}
      {covered ? <Cover /> : null}
    </View>
  );
}

function Cover() {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <View
      testID="safezone-cover"
      accessibilityLabel={t("safezone.covered")}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.ground, alignItems: "center", justifyContent: "center" }}
    >
      <Lock size={48} color={colors.inkMuted} />
    </View>
  );
}

function Checking({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const metrics = useMetrics();
  const { t } = useTranslation();
  if (!error) return <ActivityIndicator testID="safezone-checking" style={{ marginTop: metrics.space.xl * 2 }} />;
  return (
    <View style={{ gap: metrics.space.md, paddingTop: metrics.space.xl }}>
      <Text testID="safezone-status-failed" tone="danger">
        {failureMessage(error, t("safezone.statusFailed"))}
      </Text>
      <Button label={t("common.tryAgain")} block={false} onPress={onRetry} testID="safezone-status-retry" />
    </View>
  );
}

function Unlock({ attemptsLeft }: { attemptsLeft: number | null }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pausedUntil, setPausedUntil] = useState(0);
  const [showForgot, setShowForgot] = useState(false);

  useEffect(() => {
    if (!pausedUntil) return;
    const id = setTimeout(() => {
      setPausedUntil(0);
      setNotice(null);
    }, Math.max(0, pausedUntil - Date.now()));
    return () => clearTimeout(id);
  }, [pausedUntil]);

  const submit = (pin: string) => {
    setBusy(true);
    setNotice(null);
    setWrong(false);
    safezoneApi
      .unlock(pin)
      .then((grant) => useSafezoneLock.getState().unlocked(grant))
      .catch((e: unknown) => {
        const lock = useSafezoneLock.getState();
        if (e instanceof SafeZoneError) {
          if (e.kind === "wrongPin") {
            setWrong(true);
            return lock.wrongPin(e.attemptsLeft);
          }
          if (e.kind === "lockedOut" && e.lockedUntil) return lock.lockedOut(e.lockedUntil);
          if (e.kind === "notEnabled") return lock.fromPinStatus({ enabled: false, lockedOut: false, lockedUntil: null, attemptsLeft: 0 });
          if (e.kind === "rateLimited") {
            setPausedUntil(Date.now() + RATE_LIMIT_MS);
            return setNotice(t("safezone.pin.rateLimited"));
          }
        }
        setNotice(failureMessage(e, t("safezone.pin.failed")));
      })
      .finally(() => setBusy(false));
  };

  return (
    <View testID="safezone-unlock" style={{ flex: 1, alignItems: "center", gap: metrics.space.lg, paddingTop: metrics.space.xl }}>
      <Lock size={32} color={colors.accent} />
      <Text variant="title" accessibilityRole="header" style={{ textAlign: "center" }}>
        {t("safezone.pin.title")}
      </Text>
      <Text tone="muted" style={{ textAlign: "center" }}>
        {t("safezone.pin.subtitle", { digits: PIN_LENGTH })}
      </Text>
      <PinPad onComplete={submit} disabled={busy || pausedUntil > 0} />
      <View style={{ minHeight: 44, alignItems: "center", gap: metrics.space.xs }} accessibilityLiveRegion="polite">
        {busy ? <ActivityIndicator testID="safezone-unlocking" /> : null}
        {wrong && attemptsLeft !== null ? (
          <Text testID="safezone-wrong-pin" tone="danger" style={{ textAlign: "center" }}>
            {t("safezone.pin.wrong", { count: attemptsLeft })}
          </Text>
        ) : null}
        {notice ? (
          <Text testID="safezone-pin-notice" tone="danger" style={{ textAlign: "center" }}>
            {notice}
          </Text>
        ) : null}
      </View>
      <Pressable testID="safezone-forgot" onPress={() => setShowForgot((v) => !v)} accessibilityRole="button" hitSlop={8}>
        <Text tone="accent">{t("safezone.pin.forgot")}</Text>
      </Pressable>
      {showForgot ? (
        <Text testID="safezone-forgot-body" tone="muted" style={{ textAlign: "center", paddingHorizontal: metrics.space.lg }}>
          {t("safezone.pin.forgotBody")}
        </Text>
      ) : null}
    </View>
  );
}

function LockedOut({ until, onOver }: { until: string; onOver: () => void }) {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [left, setLeft] = useState(() => lockoutLeft(until));

  useEffect(() => {
    const id = setInterval(() => {
      const next = lockoutLeft(until);
      setLeft(next);
      if (next === 0) {
        clearInterval(id);
        onOver();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [until, onOver]);

  return (
    <View testID="safezone-locked-out" style={{ flex: 1, alignItems: "center", gap: metrics.space.lg, paddingTop: metrics.space.xl }}>
      <Text variant="title" accessibilityRole="header" style={{ textAlign: "center" }}>
        {t("safezone.pin.lockedOutTitle")}
      </Text>
      <Text testID="safezone-locked-out-left" tone="muted" style={{ textAlign: "center" }} accessibilityLiveRegion="polite">
        {t("safezone.pin.lockedOut", { time: formatCountdown(left) })}
      </Text>
      <PinPad onComplete={() => {}} disabled />
    </View>
  );
}

function SetUpPin({ onDone }: { onDone: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!/^\d{6}$/.test(pin)) return setError(t("safezone.setup.format"));
    if (pin !== again) return setError(t("safezone.setup.mismatch"));
    setBusy(true);
    setError(null);
    safezoneApi
      .enable({ currentPassword: password, pin, pinConfirmation: again })
      .then((status) => {
        setPin("");
        setAgain("");
        setPassword("");
        useSafezoneLock.getState().fromPinStatus(status);
        onDone();
      })
      .catch((e: unknown) => {
        if (e instanceof SafeZoneError && e.kind === "invalidPassword") return setError(t("safezone.setup.badPassword"));
        if (e instanceof SafeZoneError && e.kind === "pinMismatch") return setError(t("safezone.setup.mismatch"));
        if (e instanceof SafeZoneError && e.kind === "invalidFormat") return setError(t("safezone.setup.format"));
        setError(failureMessage(e, t("safezone.setup.failed")));
      })
      .finally(() => setBusy(false));
  };

  const field = { color: colors.ink, fontSize: 16, minHeight: metrics.touch, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md };
  // A secret field: no autofill, no suggestions, no learning (SECURITY.md §1).
  const secret = { secureTextEntry: true, autoCorrect: false, autoCapitalize: "none" as const, importantForAutofill: "no" as const, contextMenuHidden: true };

  return (
    <View testID="safezone-setup" style={{ gap: metrics.space.md, paddingTop: metrics.space.xl }}>
      <Text variant="title" accessibilityRole="header">
        {t("safezone.setup.title")}
      </Text>
      <Text tone="muted">{t("safezone.setup.body")}</Text>
      <TextInput testID="safezone-setup-pin" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={6} autoComplete="off" placeholder={t("safezone.setup.pin")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("safezone.setup.pin")} style={field} {...secret} />
      <TextInput testID="safezone-setup-again" value={again} onChangeText={(v) => setAgain(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={6} autoComplete="off" placeholder={t("safezone.setup.confirm")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("safezone.setup.confirm")} style={field} {...secret} />
      <TextInput testID="safezone-setup-password" value={password} onChangeText={setPassword} autoComplete="current-password" placeholder={t("safezone.setup.password")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("safezone.setup.password")} style={field} secureTextEntry autoCorrect={false} autoCapitalize="none" />
      {error ? (
        <Text testID="safezone-setup-error" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button label={t("safezone.setup.save")} onPress={save} busy={busy} disabled={busy || !pin || !again || !password} testID="safezone-setup-save" />
    </View>
  );
}
