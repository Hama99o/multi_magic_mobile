/**
 * Lend one of your AI keys — the web's `KeySharing.tsx`, MANIFEST row 13.
 *
 * Who may use the key, their monthly limit and what they spent; a form to
 * add somebody; a limit to change; and "stop sharing", which asks first. The
 * server emails the person and checks everything (not your own address, a
 * real address, a limit of 0 or more); its refusal is shown in its words.
 */
import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Text } from "@/components/reusables/text";
import { Input } from "@/components/reusables/input";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { failureMessage } from "@/api/failure";
import { profileKeys } from "@/api/keys";
import { KeyRefused, aiKeysApi, type AiKey, type AiKeyPayload } from "@/api/aiKeys";
import { RowAction, confirmDestructive } from "@/components/settings/AccountUi";

/** "" is no limit; anything else must be a number, 0 or more. */
export function parseLimit(raw: string): number | null | "invalid" {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : "invalid";
}

export function KeyLending({ aiKey }: { aiKey: AiKey }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const [limit, setLimit] = useState("");
  const [limitError, setLimitError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // The address whose limit is being changed, or null when lending. Lending
  // an address again changes nothing on the server, so a limit is changed
  // through its own call (`setLoanLimit`), from its row.
  const [editing, setEditing] = useState<string | null>(null);
  const loans = aiKey.sharedWith ?? [];

  const done = {
    onSuccess: (payload: AiKeyPayload) => {
      client.setQueryData(profileKeys.aiKeys(), payload);
      setFailure(null);
    },
    onError: (e: unknown) => setFailure(e instanceof KeyRefused ? e.message : failureMessage(e, t("lending.failed"))),
  };
  const lend = useMutation({
    mutationFn: (value: number | null) => aiKeysApi.lend(aiKey.id, email.trim(), value),
    ...done,
    onSuccess: (payload) => {
      done.onSuccess(payload);
      setEmail("");
      setLimit("");
    },
  });
  const stop = useMutation({ mutationFn: (to: string) => aiKeysApi.stopLending(aiKey.id, to), ...done });
  const reset = () => {
    setEditing(null);
    setEmail("");
    setLimit("");
    setLimitError(null);
    setFailure(null);
  };
  const changeLimit = useMutation({
    mutationFn: ({ to, value }: { to: string; value: number | null }) => aiKeysApi.setLoanLimit(aiKey.id, to, value),
    ...done,
    onSuccess: (payload) => {
      done.onSuccess(payload);
      reset();
    },
  });
  const startEditing = (to: string, current: number | null) => {
    setEditing(to);
    setEmail(to);
    setLimit(current == null ? "" : String(current));
    setLimitError(null);
    setFailure(null);
  };
  const busy = lend.isPending || changeLimit.isPending;

  const submit = () => {
    const value = parseLimit(limit);
    if (value === "invalid") {
      setLimitError(t("lending.limitInvalid"));
      return;
    }
    if (editing) changeLimit.mutate({ to: editing, value });
    else lend.mutate(value);
  };

  return (
    <View
      testID={`ai-key-lending-${aiKey.provider}`}
      style={{ marginTop: metrics.space.sm, paddingTop: metrics.space.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: metrics.space.sm }}
    >
      <Text variant="label">{t("lending.title")}</Text>
      <Text variant="caption" tone="muted">
        {t("lending.hint", { provider: aiKey.provider })}
      </Text>
      {loans.length === 0 ? (
        <Text variant="caption" tone="muted" testID={`ai-key-lending-none-${aiKey.provider}`}>
          {t("lending.none")}
        </Text>
      ) : (
        loans.map((loan) => (
          <View key={loan.email} testID={`ai-key-loan-${loan.email}`} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1}>{loan.email}</Text>
              <Text variant="caption" tone="muted">
                {loan.pending
                  ? t("lending.pending")
                  : loan.monthlyCreditLimit != null
                    ? t("lending.spentOf", { spent: loan.spentThisMonth, limit: loan.monthlyCreditLimit })
                    : t("lending.spent", { spent: loan.spentThisMonth })}
              </Text>
            </View>
            <RowAction
              testID={`ai-key-loan-limit-${loan.email}`}
              label={t("lending.changeLimit")}
              accessibilityLabel={t("lending.changeLimitFor", { email: loan.email })}
              onPress={() => startEditing(loan.email, loan.monthlyCreditLimit)}
            />
            <RowAction
              testID={`ai-key-loan-stop-${loan.email}`}
              label={t("lending.stop")}
              tone="danger"
              disabled={stop.isPending}
              accessibilityLabel={t("lending.stopTitle", { email: loan.email })}
              onPress={() => confirmDestructive(t("lending.stopTitle", { email: loan.email }), t("lending.stopBody"), t("lending.stop"), () => stop.mutate(loan.email))}
            />
          </View>
        ))
      )}
      <Input
        testID={`ai-key-lend-email-${aiKey.provider}`}
        label={t("lending.email")}
        value={email}
        onChangeText={(next) => {
          setEmail(next);
          setFailure(null);
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={editing === null}
      />
      <Input
        testID={`ai-key-lend-limit-${aiKey.provider}`}
        label={t("lending.limit")}
        placeholder={t("lending.limitPlaceholder")}
        value={limit}
        onChangeText={(next) => {
          setLimit(next);
          setLimitError(null);
        }}
        keyboardType="decimal-pad"
        error={limitError ?? undefined}
        errorTestID={`ai-key-lend-limit-error-${aiKey.provider}`}
      />
      <Text variant="caption" tone="muted">
        {t("lending.limitHint")}
      </Text>
      {failure ? (
        <Text testID={`ai-key-lend-error-${aiKey.provider}`} tone="danger" variant="caption">
          {failure}
        </Text>
      ) : null}
      <Button
        testID={`ai-key-lend-${aiKey.provider}`}
        label={
          editing
            ? changeLimit.isPending ? t("lending.savingLimit") : t("lending.saveLimit")
            : lend.isPending ? t("lending.sending") : t("lending.send")
        }
        busy={busy}
        disabled={email.trim().length === 0 || busy}
        onPress={submit}
      />
      {editing ? (
        <Button testID={`ai-key-lend-cancel-${aiKey.provider}`} label={t("lending.cancelEdit")} tone="neutral" onPress={reset} />
      ) : null}
    </View>
  );
}
