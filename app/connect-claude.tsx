/**
 * Connect Claude — the web's `ConnectClaude.tsx` and `McpConnections.tsx`,
 * MANIFEST rows 17 and 18.
 *
 * Two ways in, because they are not interchangeable (the web's own header):
 * claude.ai will not hold a key, so it gets the URL and does the OAuth
 * approval itself; Claude Code reads a config, so it gets a command with an
 * API key in it. Then what is connected, what it did lately, and a way to
 * cut it off, which asks first.
 *
 * The endpoint comes from the server (`mcp/connections` → `endpoint`), so it
 * is right on whichever host this build talks to.
 */
import { useState } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useNav } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { LoadFailure } from "@/components/LoadFailure";
import { failureMessage } from "@/api/failure";
import { profileKeys } from "@/api/keys";
import { claudeCodeCommand, developerApi } from "@/api/developer";
import { relativeTime } from "@/lib/relativeTime";
import { AccountHeader, Card, CardRow, LinkRow, RowAction, SectionTitle, confirmDestructive } from "@/components/settings/AccountUi";

function Snippet({ title, hint, value, testID }: { title: string; hint: string; value: string; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <View style={{ gap: metrics.space.xs, padding: metrics.space.lg }}>
      <Text variant="label">{title}</Text>
      <Text variant="caption" tone="muted">
        {hint}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: metrics.space.sm,
          marginTop: metrics.space.xs,
          padding: metrics.space.md,
          borderRadius: metrics.radius.md,
          backgroundColor: colors.ground,
        }}
      >
        <Text testID={testID} selectable style={{ flex: 1, fontFamily: "monospace" }}>
          {value}
        </Text>
        <RowAction
          testID={`${testID}-copy`}
          label={copied ? t("connectClaude.copied") : t("connectClaude.copy")}
          onPress={() => {
            void Clipboard.setStringAsync(value);
            setCopied(true);
          }}
        />
      </View>
    </View>
  );
}

export default function ConnectClaude() {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);
  const query = useQuery({ queryKey: profileKeys.mcp(), queryFn: developerApi.mcp });
  const disconnect = useMutation({
    mutationFn: (clientId: number) => developerApi.disconnectMcp(clientId),
    onSuccess: () => {
      setFailure(null);
      void client.invalidateQueries({ queryKey: profileKeys.mcp() });
    },
    onError: (e) => setFailure(failureMessage(e, t("connectClaude.disconnectFailed"))),
  });

  const data = query.data;
  return (
    <Screen measure scroll>
      <AccountHeader title={t("connectClaude.title")} />
      <Text tone="muted">{t("connectClaude.intro")}</Text>

      <LoadFailure
        error={query.error}
        loadFailed={t("connectClaude.loadFailed")}
        hasData={Boolean(data)}
        updatedAt={query.dataUpdatedAt}
        onRetry={() => void query.refetch()}
        testID="connect-claude-failed"
      />

      {data?.endpoint ? (
        <View style={{ marginTop: metrics.space.lg }}>
          <Card testID="connect-claude-how">
            <Snippet
              testID="connect-claude-url"
              title={t("connectClaude.webTitle")}
              hint={t("connectClaude.webHint")}
              value={data.endpoint}
            />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <Snippet
              testID="connect-claude-command"
              title={t("connectClaude.codeTitle")}
              hint={t("connectClaude.codeHint")}
              value={claudeCodeCommand(data.endpoint)}
            />
            <LinkRow testID="connect-claude-api-keys" label={t("profileMore.apiKeys")} onPress={() => router.push("/api-keys")} />
          </Card>
        </View>
      ) : null}

      <SectionTitle>{t("connectClaude.connectionsTitle")}</SectionTitle>
      {failure ? (
        <Text testID="connect-claude-error" tone="danger" variant="caption">
          {failure}
        </Text>
      ) : null}
      {data && data.connections.length === 0 ? (
        <Text tone="muted" testID="connect-claude-empty">
          {t("connectClaude.connectionsEmpty")}
        </Text>
      ) : null}
      {data && data.connections.length > 0 ? (
        <Card testID="connect-claude-connections">
          {data.connections.map((c, i) => (
            <CardRow
              key={c.id}
              first={i === 0}
              testID={`connect-claude-connection-${c.id}`}
              title={c.name}
              detail={[
                c.connectedAt ? t("connectClaude.connectedSince", { when: relativeTime(c.connectedAt) }) : null,
                c.lastUsedAt ? t("connectClaude.lastUsed", { when: relativeTime(c.lastUsedAt) }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              end={
                <RowAction
                  testID={`connect-claude-disconnect-${c.id}`}
                  label={t("connectClaude.disconnect")}
                  tone="danger"
                  disabled={disconnect.isPending}
                  accessibilityLabel={`${t("connectClaude.disconnect")}: ${c.name}`}
                  onPress={() =>
                    confirmDestructive(
                      t("connectClaude.disconnectTitle", { name: c.name }),
                      t("connectClaude.disconnectBody"),
                      t("connectClaude.disconnect"),
                      () => disconnect.mutate(c.id),
                    )
                  }
                />
              }
            />
          ))}
        </Card>
      ) : null}

      <SectionTitle>{t("connectClaude.activityTitle")}</SectionTitle>
      {data && data.activity.length === 0 ? (
        <Text tone="muted" testID="connect-claude-activity-empty">
          {t("connectClaude.activityEmpty")}
        </Text>
      ) : null}
      {data && data.activity.length > 0 ? (
        <Card testID="connect-claude-activity">
          {data.activity.map((call, i) => (
            <CardRow
              key={call.id}
              first={i === 0}
              title={t("connectClaude.activityRow", { tool: call.tool, via: call.via ?? "—" })}
              detail={[call.createdAt ? relativeTime(call.createdAt) : null, call.status].filter(Boolean).join(" · ")}
            />
          ))}
        </Card>
      ) : null}
      <View style={{ height: metrics.space.xl }} />
    </Screen>
  );
}
