/**
 * Security — the web's Devices page and the 2FA card of its profile drawer
 * on one screen (`pages/profile/devices/Index.tsx`, `EditProfileDrawer.tsx`).
 * `docs/design/profile-parity/MANIFEST.md` rows 6, 8, 9, 10.
 *
 * Shape from the references (`SPEC.md` beside the manifest): a list per kind
 * (Citi Bike's security centre), the current session marked and the others
 * each with a sign-out (Expedia's connected devices), and a confirm before a
 * sign-out (Wealthfront's security log).
 *
 * ── WHAT IS ASKED AGAIN, EXACTLY AS THE SERVER ASKS ───────────────────────
 * Two-step sign-in on and off: the current password (`two_factor_controller`).
 * Signing a device out, forgetting a trusted one, and the history: nothing
 * beyond the session, as on the web, and each asks first.
 */
import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useMetrics } from "@/hooks/useColors";
import { LoadFailure } from "@/components/LoadFailure";
import { failureMessage } from "@/api/failure";
import { profileKeys } from "@/api/keys";
import { profileApi, WrongCurrentPassword, type Profile } from "@/api/profile";
import { securityApi } from "@/api/security";
import { relativeTime } from "@/lib/relativeTime";
import { SecretField } from "@/components/settings/SecretField";
import { AccountHeader, Card, CardRow, RowAction, SectionTitle, confirmDestructive } from "@/components/settings/AccountUi";
import { deviceName } from "@/lib/deviceLabel";

const when = (iso: string | null | undefined) => (iso ? relativeTime(iso) : "—");

function TwoFactor({ profile }: { profile: Profile }) {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const on = profile.twoFactorEnabled === true;
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);

  // The password is the mutation's closure, never its variables: React
  // Query keeps variables in its cache (PinForms.tsx, same rule).
  const toggle = useMutation({
    mutationFn: () => securityApi.setTwoFactor(!on, password),
    onSuccess: () => {
      client.setQueryData<Profile>(profileKeys.me(), (p) => (p ? { ...p, twoFactorEnabled: !on } : p));
      setAsking(false);
      setPassword("");
      setFailure(null);
      setWrong(false);
    },
    onError: (e) => {
      setWrong(e instanceof WrongCurrentPassword);
      setFailure(e instanceof WrongCurrentPassword ? t("password.wrongCurrent") : failureMessage(e, t("security.twoFactorFailed")));
    },
  });

  return (
    <>
      <SectionTitle>{t("security.twoFactorTitle")}</SectionTitle>
      <Card testID="security-2fa">
        <View style={{ padding: metrics.space.lg, gap: metrics.space.md }}>
          <Text testID="security-2fa-state">{on ? t("security.twoFactorOn") : t("security.twoFactorOff")}</Text>
          {asking ? (
            <>
              <SecretField
                label={on ? t("security.passwordToTurnOff") : t("security.passwordToTurnOn")}
                value={password}
                onChange={(next) => {
                  setPassword(next);
                  setWrong(false);
                }}
                testID="security-2fa-password"
                invalid={wrong}
              />
              {failure ? (
                <Text testID="security-2fa-error" tone="danger" variant="caption">
                  {failure}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    testID="security-2fa-cancel"
                    label={t("security.cancel")}
                    tone="neutral"
                    onPress={() => {
                      setAsking(false);
                      setPassword("");
                      setFailure(null);
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    testID="security-2fa-confirm"
                    label={toggle.isPending ? t("security.confirming") : t("security.confirm")}
                    tone={on ? "danger" : "primary"}
                    busy={toggle.isPending}
                    disabled={password.length === 0}
                    onPress={() => toggle.mutate()}
                  />
                </View>
              </View>
            </>
          ) : (
            <Button
              testID="security-2fa-toggle"
              label={on ? t("security.turnOff") : t("security.turnOn")}
              tone={on ? "neutral" : "primary"}
              onPress={() => setAsking(true)}
            />
          )}
        </View>
      </Card>
    </>
  );
}

function Sessions() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);
  const query = useQuery({ queryKey: profileKeys.sessions(), queryFn: securityApi.sessions });
  const signOut = useMutation({
    mutationFn: (id: number) => securityApi.signOutSession(id),
    onSuccess: () => {
      setFailure(null);
      void client.invalidateQueries({ queryKey: profileKeys.sessions() });
    },
    onError: (e) => setFailure(failureMessage(e, t("security.signOutFailed"))),
  });

  const rows = query.data ?? [];
  return (
    <>
      <SectionTitle>{t("security.sessionsTitle")}</SectionTitle>
      <LoadFailure
        error={query.error}
        loadFailed={t("security.loadFailed")}
        hasData={Boolean(query.data)}
        updatedAt={query.dataUpdatedAt}
        onRetry={() => void query.refetch()}
        testID="security-sessions-failed"
        padded={false}
      />
      {failure ? (
        <Text testID="security-sessions-error" tone="danger" variant="caption">
          {failure}
        </Text>
      ) : null}
      {query.data && rows.length === 0 ? (
        <Text tone="muted" testID="security-sessions-empty">
          {t("security.sessionsEmpty")}
        </Text>
      ) : null}
      {rows.length > 0 ? (
        <Card testID="security-sessions">
          {rows.map((s, i) => {
            const device = deviceName(s.deviceLabel, t);
            return (
              <CardRow
                key={s.id}
                first={i === 0}
                testID={`security-session-${s.id}`}
                title={device}
                detail={[t("security.signedInSince", { when: when(s.createdAt) }), s.ipAddress].filter(Boolean).join(" · ")}
                end={
                  s.isCurrent ? (
                    <Text variant="caption" tone="accent" testID="security-session-current">
                      {t("security.thisPhone")}
                    </Text>
                  ) : (
                    <RowAction
                      testID={`security-session-signout-${s.id}`}
                      label={t("security.signOut")}
                      tone="danger"
                      disabled={signOut.isPending}
                      accessibilityLabel={`${t("security.signOut")}: ${device}`}
                      onPress={() =>
                        confirmDestructive(
                          t("security.signOutTitle"),
                          t("security.signOutBody", { device }),
                          t("security.signOut"),
                          () => signOut.mutate(s.id),
                        )
                      }
                    />
                  )
                }
              />
            );
          })}
        </Card>
      ) : null}
    </>
  );
}


function Trusted() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);
  // Newest first as the server orders them, one more page per press.
  const query = useInfiniteQuery({
    queryKey: profileKeys.trustedDevices(),
    queryFn: ({ pageParam }) => securityApi.trustedDevices(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const forget = useMutation({
    mutationFn: (id: number) => securityApi.forgetDevice(id),
    onSuccess: () => {
      setFailure(null);
      void client.invalidateQueries({ queryKey: profileKeys.trustedDevices() });
    },
    onError: (e) => setFailure(failureMessage(e, t("security.forgetFailed"))),
  });
  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <>
      <SectionTitle hint={t("security.trustedHint")}>{t("security.trustedTitle")}</SectionTitle>
      <LoadFailure
        error={query.error}
        loadFailed={t("security.loadFailed")}
        hasData={Boolean(query.data)}
        updatedAt={query.dataUpdatedAt}
        onRetry={() => void query.refetch()}
        testID="security-trusted-failed"
        padded={false}
      />
      {failure ? (
        <Text testID="security-trusted-error" tone="danger" variant="caption">
          {failure}
        </Text>
      ) : null}
      {query.data && rows.length === 0 ? (
        <Text tone="muted" testID="security-trusted-empty">
          {t("security.trustedEmpty")}
        </Text>
      ) : null}
      {rows.length > 0 ? (
        <Card testID="security-trusted">
          {rows.map((d, i) => {
            const device = d.label ?? t("security.unknownDevice");
            return (
              <CardRow
                key={d.id}
                first={i === 0}
                testID={`security-trusted-${d.id}`}
                title={device}
                detail={t("security.lastUsed", { when: when(d.lastUsedAt) })}
                end={
                  <RowAction
                    testID={`security-trusted-forget-${d.id}`}
                    label={t("security.forget")}
                    tone="danger"
                    disabled={forget.isPending}
                    accessibilityLabel={`${t("security.forget")}: ${device}`}
                    onPress={() =>
                      confirmDestructive(t("security.forgetTitle"), t("security.forgetBody", { device }), t("security.forget"), () =>
                        forget.mutate(d.id),
                      )
                    }
                  />
                }
              />
            );
          })}
        </Card>
      ) : null}
      {query.hasNextPage ? (
        <View style={{ marginTop: metrics.space.sm }}>
          <RowAction
            testID="security-trusted-more"
            label={t("security.showMore")}
            disabled={query.isFetchingNextPage}
            onPress={() => void query.fetchNextPage()}
          />
        </View>
      ) : null}
    </>
  );
}

function History() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: profileKeys.loginHistory(),
    queryFn: ({ pageParam }) => securityApi.loginHistory(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const done = {
    onSuccess: () => {
      setFailure(null);
      void client.invalidateQueries({ queryKey: profileKeys.loginHistory() });
    },
    onError: (e: unknown) => setFailure(failureMessage(e, t("security.historyFailed"))),
  };
  const remove = useMutation({ mutationFn: (id: number) => securityApi.deleteLogin(id), ...done });
  const clear = useMutation({ mutationFn: () => securityApi.clearLoginHistory(), ...done });
  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];
  const busy = remove.isPending || clear.isPending;

  return (
    <>
      <SectionTitle>{t("security.historyTitle")}</SectionTitle>
      <LoadFailure
        error={query.error}
        loadFailed={t("security.loadFailed")}
        hasData={Boolean(query.data)}
        updatedAt={query.dataUpdatedAt}
        onRetry={() => void query.refetch()}
        testID="security-history-failed"
        padded={false}
      />
      {failure ? (
        <Text testID="security-history-error" tone="danger" variant="caption">
          {failure}
        </Text>
      ) : null}
      {query.data && rows.length === 0 ? (
        <Text tone="muted" testID="security-history-empty">
          {t("security.historyEmpty")}
        </Text>
      ) : null}
      {rows.length > 0 ? (
        <Card testID="security-history">
          {rows.map((r, i) => (
            <CardRow
              key={r.id}
              first={i === 0}
              testID={`security-history-${r.id}`}
              title={deviceName(r.deviceLabel, t)}
              detail={[when(r.createdAt), r.ipAddress].filter(Boolean).join(" · ")}
              end={
                <RowAction
                  testID={`security-history-delete-${r.id}`}
                  label="✕"
                  accessibilityLabel={t("security.deleteEntry")}
                  disabled={busy}
                  onPress={() => remove.mutate(r.id)}
                />
              }
            />
          ))}
        </Card>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: metrics.space.sm }}>
        {query.hasNextPage ? (
          <RowAction
            testID="security-history-more"
            label={t("security.showMore")}
            disabled={query.isFetchingNextPage}
            onPress={() => void query.fetchNextPage()}
          />
        ) : (
          <View />
        )}
        {rows.length > 0 ? (
          <RowAction
            testID="security-history-clear"
            label={t("security.clearHistory")}
            tone="danger"
            disabled={busy}
            onPress={() =>
              confirmDestructive(t("security.clearTitle"), t("security.clearBody"), t("security.clearHistory"), () => clear.mutate())
            }
          />
        ) : null}
      </View>
    </>
  );
}

export default function Security() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const me = useQuery({ queryKey: profileKeys.me(), queryFn: profileApi.me });

  return (
    <Screen measure scroll avoidKeyboard>
      <AccountHeader title={t("security.title")} />
      <LoadFailure
        error={me.error}
        loadFailed={t("profile.loadFailed")}
        hasData={Boolean(me.data)}
        updatedAt={me.dataUpdatedAt}
        onRetry={() => void me.refetch()}
        testID="security-load-failed"
      />
      {me.data ? <TwoFactor profile={me.data} /> : null}
      <Sessions />
      <Trusted />
      <History />
      <View style={{ height: metrics.space.xl }} />
    </Screen>
  );
}
