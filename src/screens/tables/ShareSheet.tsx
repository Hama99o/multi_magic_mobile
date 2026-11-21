/**
 * SHARE THE BASE (increment 5; the web's `ShareDialog.tsx:27-33`).
 *
 * Everyone who can open the base sees who else can; only its owner changes
 * it (`BasePolicy#share?`): invite by email with a role, change a role,
 * resend a pending invitation, remove someone. An address with no account
 * gets an invitation EMAIL, a message to a real person, so the sheet says
 * so on the button's own line before anything is sent.
 */
import { useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { tablesApi, type BaseMember } from "@/api/tables";
import { failureMessage } from "@/api/failure";
import { BottomSheet } from "@/components/BottomSheet";
import { SheetButton } from "@/components/fields/FieldRow";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { useColors, useMetrics } from "@/hooks/useColors";

const ROLES = ["editor", "viewer"] as const;

export function ShareSheet({ baseId, baseName, isOwner, onClose }: { baseId: number; baseName: string; isOwner: boolean; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const people = useQuery({ queryKey: tablesKeys.members(baseId), queryFn: () => tablesApi.members(baseId) });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "muted"; text: string } | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: tablesKeys.members(baseId) });

  const run = async (work: () => Promise<unknown>, done: string, failed: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      await refresh();
      setMessage({ tone: "muted", text: done });
      return true;
    } catch (e) {
      setMessage({ tone: "danger", text: failureMessage(e, failed) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const invite = async () => {
    const address = email.trim();
    if (await run(() => tablesApi.share(baseId, address, role), t("tables.share.invited", { email: address }), t("tables.share.failed"))) setEmail("");
  };
  const remove = (m: BaseMember) =>
    Alert.alert(t("tables.share.removeTitle", { who: m.name ?? m.email }), t("tables.share.removeBody", { base: baseName }), [
      { text: t("fields.cancel"), style: "cancel" },
      { text: t("tables.share.remove"), style: "destructive", onPress: () => void run(() => tablesApi.removeMember(baseId, m.id), t("tables.share.removed"), t("tables.share.failed")) },
    ]);

  return (
    <BottomSheet open title={t("tables.share.title")} subtitle={baseName} onClose={onClose} testID="tables-share">
      <View style={{ gap: metrics.space.sm, paddingHorizontal: metrics.space.lg }}>
        {people.isPending ? <RowsSkeleton rows={2} testID="tables-share-loading" /> : null}
        {people.error ? <Text tone="danger">{failureMessage(people.error, t("tables.share.loadFailed"))}</Text> : null}
        {people.data ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", minHeight: metrics.touch }}>
              <View style={{ flex: 1 }}>
                <Text variant="label">{people.data.owner.name}</Text>
                <Text tone="muted" variant="caption">
                  {people.data.owner.email}
                </Text>
              </View>
              <Text tone="muted" variant="caption">
                {t("tables.share.owner")}
              </Text>
            </View>
            {people.data.members.map((m, i) => (
              <View key={m.id} testID={`tables-share-member-${i}`} style={{ gap: 4, paddingVertical: metrics.space.xs, borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="label">{m.name ?? m.email}</Text>
                    <Text tone="muted" variant="caption">
                      {m.pending ? t("tables.share.pending", { email: m.email }) : m.email}
                    </Text>
                  </View>
                  {isOwner ? null : (
                    <Text tone="muted" variant="caption">
                      {t(`tables.share.roles.${m.role}`)}
                    </Text>
                  )}
                </View>
                {isOwner ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
                    {ROLES.map((r) => {
                      const on = m.role === r;
                      return (
                        <Pressable key={r} testID={`tables-share-member-${i}-${r}`} disabled={on || busy} onPress={() => void run(() => tablesApi.setRole(baseId, m.id, r), t("tables.share.roleChanged"), t("tables.share.failed"))} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t(`tables.share.roles.${r}`)} style={{ minHeight: 32, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center", borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.surface }}>
                          <Text variant="caption" tone={on ? "onAccent" : "default"}>
                            {t(`tables.share.roles.${r}`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {m.pending ? (
                      <Pressable testID={`tables-share-member-${i}-resend`} disabled={busy} onPress={() => void run(() => tablesApi.resendInvite(baseId, m.id), t("tables.share.resent", { email: m.email }), t("tables.share.failed"))} accessibilityRole="button" accessibilityLabel={t("tables.share.resend")} style={{ minHeight: 32, paddingHorizontal: metrics.space.md, justifyContent: "center" }}>
                        <Text variant="caption" tone="accent">
                          {t("tables.share.resend")}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable testID={`tables-share-member-${i}-remove`} disabled={busy} onPress={() => remove(m)} accessibilityRole="button" accessibilityLabel={t("tables.share.remove")} style={{ minHeight: 32, paddingHorizontal: metrics.space.md, justifyContent: "center" }}>
                      <Text variant="caption" tone="danger">
                        {t("tables.share.remove")}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
            {people.data.members.length === 0 ? <Text tone="muted">{t("tables.share.nobody")}</Text> : null}
          </>
        ) : null}

        {isOwner ? (
          <View style={{ gap: metrics.space.xs, marginTop: metrics.space.md }}>
            <Text variant="label">{t("tables.share.inviteTitle")}</Text>
            <TextInput
              testID="tables-share-email"
              value={email}
              onChangeText={setEmail}
              placeholder={t("tables.share.emailPlaceholder")}
              placeholderTextColor={colors.inkMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t("tables.share.emailPlaceholder")}
              style={{ minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface }}
            />
            <View style={{ flexDirection: "row", gap: metrics.space.xs }}>
              {ROLES.map((r) => {
                const on = role === r;
                return (
                  <Pressable key={r} testID={`tables-share-role-${r}`} onPress={() => setRole(r)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t(`tables.share.roles.${r}`)} accessibilityHint={t(`tables.share.roleHints.${r}`)} style={{ minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center", borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.surface }}>
                    <Text variant="label" tone={on ? "onAccent" : "default"}>
                      {t(`tables.share.roles.${r}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text tone="muted" variant="caption">
              {t("tables.share.emailWarning")}
            </Text>
            <SheetButton testID="tables-share-invite" label={t("tables.share.invite")} disabled={!/^\S+@\S+\.\S+$/.test(email.trim()) || busy} busy={busy} onPress={() => void invite()} />
          </View>
        ) : (
          <Text tone="muted" variant="caption">
            {t("tables.share.ownerOnly")}
          </Text>
        )}
        {message ? (
          <Text tone={message.tone} testID="tables-share-message" accessibilityLiveRegion="polite">
            {message.text}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}
