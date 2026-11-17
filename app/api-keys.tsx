/**
 * Personal API keys — the web's `pages/profile/api_keys/Index.tsx`, MANIFEST
 * row 16. A key lets an agent (Claude Code, a script) act as this person.
 *
 * ── THE TOKEN IS SHOWN ONCE, AND HELD BY THIS SCREEN ONLY ─────────────────
 * The server returns the raw token in the create answer and never again
 * (`api_keys_controller.rb`, `masked_token` after that). Here it lives in one
 * `useState` of this screen: not in React Query's cache (the create mutation
 * returns nothing to the cache and the list is refetched), not in storage,
 * never logged. Leaving the screen unmounts it and it is gone, which is what
 * "shown once" means. The card says so (ChatGPT's "Key ready" card:
 * "You will not be able to retrieve this key again").
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Input } from "@/components/reusables/input";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { LoadFailure } from "@/components/LoadFailure";
import { failureMessage } from "@/api/failure";
import { profileKeys } from "@/api/keys";
import { developerApi, type ApiScope } from "@/api/developer";
import { relativeTime } from "@/lib/relativeTime";
import { AccountHeader, Card, CardRow, RowAction, SectionTitle, confirmDestructive } from "@/components/settings/AccountUi";

const EXPIRIES = [
  { key: "never", labelKey: "apiKeys.never", days: null },
  { key: "days30", labelKey: "apiKeys.days30", days: 30 },
  { key: "days90", labelKey: "apiKeys.days90", days: 90 },
  { key: "year1", labelKey: "apiKeys.year1", days: 365 },
] as const;

/**
 * An expiry is a date in the app's language, or "Expired" once passed.
 * Not `relativeTime`: that reads only the past and clamps a future date to
 * "just now" (device QA 2026-11-17: a 30-day key listed as "Expires just now").
 */
function expiryLabel(iso: string, t: TFunction, language: string): string {
  const at = new Date(iso);
  if (at.getTime() <= Date.now()) return t("apiKeys.expired");
  return t("apiKeys.expires", { when: at.toLocaleDateString(language, { day: "numeric", month: "short", year: "numeric" }) });
}

function Choice({ label, detail, selected, onPress, testID }: { label: string; detail?: string; selected: boolean; onPress: () => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={{
        flexGrow: 1,
        // Device QA 2026-11-17: grow alone let a described card push its
        // neighbour off a 411 dp screen. Cards with a description share the
        // row equally and wrap their text; short chips keep their own width.
        flexShrink: 1,
        flexBasis: detail ? 0 : "auto",
        minHeight: metrics.touch,
        paddingHorizontal: metrics.space.md,
        paddingVertical: metrics.space.sm,
        borderRadius: metrics.radius.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.accent : colors.border,
        justifyContent: "center",
      }}
    >
      <Text variant="label">{label}</Text>
      {detail ? (
        <Text variant="caption" tone="muted">
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default function ApiKeys() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const list = useQuery({ queryKey: profileKeys.apiKeys(), queryFn: developerApi.apiKeys });

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(["read"]);
  const [expiry, setExpiry] = useState<(typeof EXPIRIES)[number]["key"]>("never");
  const [nameError, setNameError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** The one copy of the new token. See the header. */
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = () => void client.invalidateQueries({ queryKey: profileKeys.apiKeys() });

  const create = useMutation({
    mutationFn: async () => {
      const days = EXPIRIES.find((e) => e.key === expiry)?.days ?? null;
      const expiresAt = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
      const made = await developerApi.createApiKey(name.trim(), scopes, expiresAt);
      setToken(made.token);
      // Nothing returned: the mutation's data is cached by React Query, and
      // the token must not be.
    },
    onSuccess: () => {
      setCopied(false);
      setName("");
      setFailure(null);
      refresh();
    },
    onError: (e) => setFailure(failureMessage(e, t("apiKeys.createFailed"))),
  });

  const remove = useMutation({
    mutationFn: (id: number) => developerApi.deleteApiKey(id),
    onSuccess: () => {
      setFailure(null);
      refresh();
    },
    onError: (e) => setFailure(failureMessage(e, t("apiKeys.deleteFailed"))),
  });

  const toggleScope = (scope: ApiScope) =>
    setScopes((current) => (current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]));

  const submit = () => {
    if (!name.trim()) {
      setNameError(t("apiKeys.nameRequired"));
      return;
    }
    create.mutate();
  };

  const keys = list.data ?? [];

  return (
    <Screen measure scroll avoidKeyboard>
      <AccountHeader title={t("apiKeys.title")} />
      <Text tone="muted">{t("apiKeys.intro")}</Text>

      {token ? (
        <View
          testID="api-key-ready"
          style={{
            marginTop: metrics.space.lg,
            padding: metrics.space.lg,
            gap: metrics.space.md,
            borderRadius: metrics.radius.md,
            borderWidth: 1,
            borderColor: colors.accent,
            backgroundColor: colors.surface,
          }}
        >
          <Text variant="label">{t("apiKeys.readyTitle")}</Text>
          <Text variant="caption" tone="muted">
            {t("apiKeys.readyBody")}
          </Text>
          {/* Shown in full here only. QA sheets blur this box. */}
          <Text testID="api-key-token" selectable style={{ fontFamily: "monospace" }}>
            {token}
          </Text>
          <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                testID="api-key-copy"
                label={copied ? t("apiKeys.copied") : t("apiKeys.copy")}
                onPress={() => {
                  void Clipboard.setStringAsync(token);
                  setCopied(true);
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button testID="api-key-dismiss" label={t("apiKeys.dismiss")} tone="neutral" onPress={() => setToken(null)} />
            </View>
          </View>
        </View>
      ) : null}

      <SectionTitle>{t("apiKeys.create")}</SectionTitle>
      <View style={{ gap: metrics.space.md }}>
        <Input
          testID="api-key-name"
          label={t("apiKeys.name")}
          placeholder={t("apiKeys.namePlaceholder")}
          value={name}
          onChangeText={(next) => {
            setName(next);
            setNameError(null);
          }}
          maxLength={100}
          error={nameError}
          errorTestID="api-key-name-error"
        />
        <Text variant="caption" tone="muted">
          {t("apiKeys.scopes")}
        </Text>
        <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
          <Choice
            testID="api-key-scope-read"
            label={t("apiKeys.read")}
            detail={t("apiKeys.readDetail")}
            selected={scopes.includes("read")}
            onPress={() => toggleScope("read")}
          />
          <Choice
            testID="api-key-scope-write"
            label={t("apiKeys.write")}
            detail={t("apiKeys.writeDetail")}
            selected={scopes.includes("write")}
            onPress={() => toggleScope("write")}
          />
        </View>
        <Text variant="caption" tone="muted">
          {t("apiKeys.expiry")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
          {EXPIRIES.map((e) => (
            <Choice
              key={e.key}
              testID={`api-key-expiry-${e.key}`}
              label={t(e.labelKey)}
              selected={expiry === e.key}
              onPress={() => setExpiry(e.key)}
            />
          ))}
        </View>
        {failure ? (
          <Text testID="api-keys-error" tone="danger" variant="caption">
            {failure}
          </Text>
        ) : null}
        <Button
          testID="api-key-create"
          label={create.isPending ? t("apiKeys.creating") : t("apiKeys.create")}
          busy={create.isPending}
          disabled={scopes.length === 0}
          onPress={submit}
        />
      </View>

      <SectionTitle>{t("apiKeys.title")}</SectionTitle>
      <LoadFailure
        error={list.error}
        loadFailed={t("apiKeys.loadFailed")}
        hasData={Boolean(list.data)}
        updatedAt={list.dataUpdatedAt}
        onRetry={() => void list.refetch()}
        testID="api-keys-load-failed"
        padded={false}
      />
      {list.data && keys.length === 0 ? (
        <Text tone="muted" testID="api-keys-empty">
          {t("apiKeys.empty")}
        </Text>
      ) : null}
      {keys.length > 0 ? (
        <Card testID="api-keys-list">
          {keys.map((k, i) => (
            <CardRow
              key={k.id}
              first={i === 0}
              testID={`api-key-${k.id}`}
              title={k.name}
              detail={[
                k.masked,
                k.scopes.includes("write") ? t("apiKeys.readWrite") : t("apiKeys.readOnly"),
                k.lastUsedAt ? t("apiKeys.lastUsed", { when: relativeTime(k.lastUsedAt) }) : t("apiKeys.neverUsed"),
                k.expiresAt ? expiryLabel(k.expiresAt, t, i18n.language) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              end={
                <RowAction
                  testID={`api-key-delete-${k.id}`}
                  label={t("apiKeys.delete")}
                  tone="danger"
                  disabled={remove.isPending}
                  accessibilityLabel={`${t("apiKeys.delete")}: ${k.name}`}
                  onPress={() =>
                    confirmDestructive(t("apiKeys.deleteTitle", { name: k.name }), t("apiKeys.deleteBody"), t("apiKeys.delete"), () =>
                      remove.mutate(k.id),
                    )
                  }
                />
              }
            />
          ))}
        </Card>
      ) : null}
      <View style={{ height: metrics.space.xl }} />
    </Screen>
  );
}
