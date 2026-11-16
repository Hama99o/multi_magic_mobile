/**
 * SHARE A NOTE (audit #23) — the web's Invite user panel
 * (`pages/notes/components/InviteUserModal.tsx`), for the owner or an
 * administrator (`note_policy.rb#share_with_user_toggle?`; the editor only
 * offers it to them).
 *
 * - Invite by email with a role. The web offers Viewer and Editor
 *   (contributor), Viewer first; so does this. An email with no account is
 *   invited by mail by the server (EmailRecord) and nobody new appears in the
 *   list, as on the web.
 * - Each collaborator: name and email, their role (changeable), remove
 *   (after a confirmation the web does not ask for: a tap on a phone is too
 *   easy to make by accident).
 * - A refusal ("User is already invited") shows the server's sentence.
 *
 * Every write goes through the data layer (api/queries.ts), which writes the
 * server's note into the open note and the cards, and refreshes both.
 */
import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import UserMinusIcon from "lucide-react-native/dist/esm/icons/user-minus";

import { Text } from "@/components/reusables/text";
import { KeyboardPadding } from "@/components/KeyboardPadding";
import { X } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { failureMessage } from "@/api/failure";
import type { Note, NoteCollaborator, ShareRole } from "@/api/notes";
import { Avatar } from "@/screens/people/Avatar";
import { useSetShareRole, useShareNote, useUnshareNote } from "./api/queries";

/** What the web offers to pick (an administrator made elsewhere still shows as one). */
const PICKABLE: readonly ShareRole[] = ["viewer", "contributor"];

export function NoteShareSheet({ visible, note, onClose }: { visible: boolean; note: Pick<Note, "id" | "sharedUsers">; onClose(): void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const share = useShareNote();
  const unshare = useUnshareNote();
  const setRole = useSetShareRole();
  const [email, setEmail] = useState("");
  const [role, setInviteRole] = useState<ShareRole>("viewer");
  const [failed, setFailed] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [rolesOpenFor, setRolesOpenFor] = useState<number | null>(null);
  const roleLabel = (r: ShareRole | null) => t(`notes.share.roles.${r ?? "viewer"}`);
  const trimmed = email.trim();
  const canInvite = trimmed.length > 0 && !share.isPending;

  const run = async (fn: () => Promise<unknown>) => {
    setFailed(null);
    setSent(false);
    try {
      await fn();
      return true;
    } catch (e) {
      setFailed(failureMessage(e, t("notes.share.failed")));
      return false;
    }
  };

  const invite = async () => {
    if (!canInvite) return;
    if (await run(() => share.mutateAsync({ id: note.id, email: trimmed, role }))) {
      setEmail("");
      setSent(true);
    }
  };

  const confirmRemove = (u: NoteCollaborator) =>
    Alert.alert(t("notes.share.removeTitle", { name: u.name }), t("notes.share.removeBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("notes.share.remove"), style: "destructive", onPress: () => void run(() => unshare.mutateAsync({ id: note.id, userId: u.id })) },
    ]);

  const chip = (testID: string, label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={testID}
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={4}
      style={{
        borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? `${colors.accent}26` : "transparent",
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: selected ? "700" : "400" }}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardPadding>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
          <View testID="note-share-sheet" style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: metrics.space.lg, gap: metrics.space.sm, maxHeight: "85%" }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: "700" }} accessibilityRole="header">{t("notes.share.title")}</Text>
              <Pressable testID="note-share-close" onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.close")} style={{ padding: 8 }}>
                <X size={22} color={colors.ink} />
              </Pressable>
            </View>
            <TextInput
              testID="note-share-email"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setSent(false);
              }}
              placeholder={t("notes.share.email")}
              accessibilityLabel={t("notes.share.email")}
              placeholderTextColor={colors.inkMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              returnKeyType="send"
              onSubmitEditing={() => void invite()}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.ink, fontSize: 16 }}
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text tone="muted" style={{ fontSize: 13 }}>{t("notes.share.role")}</Text>
              {PICKABLE.map((r) => chip(`note-share-role-${r}`, roleLabel(r), role === r, () => setInviteRole(r)))}
              <View style={{ flex: 1 }} />
              <Pressable
                testID="note-share-invite"
                onPress={() => void invite()}
                disabled={!canInvite}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canInvite, busy: share.isPending }}
                style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: canInvite ? colors.accent : colors.border }}
              >
                <Text style={{ color: colors.ground, fontWeight: "700" }}>{t("notes.share.invite")}</Text>
              </Pressable>
            </View>
            {failed ? (
              <Text testID="note-share-failed" style={{ color: colors.danger, fontSize: 13 }} accessibilityLiveRegion="polite">{failed}</Text>
            ) : sent ? (
              <Text testID="note-share-sent" tone="muted" style={{ fontSize: 13 }} accessibilityLiveRegion="polite">{t("notes.share.sent")}</Text>
            ) : null}
            {note.sharedUsers.length ? (
              <Text tone="muted" style={{ fontSize: 12, fontWeight: "600", marginTop: metrics.space.sm }}>{t("notes.share.sharedWith")}</Text>
            ) : null}
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
              {note.sharedUsers.map((u) => (
                <View key={u.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.border }}>
                  <View testID={`note-share-user-${u.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}>
                    <Avatar name={u.name} uri={u.avatar} userId={u.id} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 15 }}>{u.name}</Text>
                      {u.email && u.email !== u.name ? <Text numberOfLines={1} tone="muted" style={{ fontSize: 12 }}>{u.email}</Text> : null}
                    </View>
                    <Pressable
                      testID={`note-share-user-${u.id}-role`}
                      onPress={() => setRolesOpenFor(rolesOpenFor === u.id ? null : u.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t("notes.share.role")}: ${roleLabel(u.role)}`}
                      accessibilityState={{ expanded: rolesOpenFor === u.id }}
                      hitSlop={4}
                      style={{ borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 4 }}
                    >
                      <Text style={{ fontSize: 13 }}>{roleLabel(u.role)}</Text>
                    </Pressable>
                    <Pressable
                      testID={`note-share-user-${u.id}-remove`}
                      onPress={() => confirmRemove(u)}
                      accessibilityRole="button"
                      accessibilityLabel={t("notes.share.removeNamed", { name: u.name })}
                      hitSlop={6}
                      style={{ padding: 6 }}
                    >
                      <UserMinusIcon size={20} color={colors.danger} />
                    </Pressable>
                  </View>
                  {rolesOpenFor === u.id ? (
                    <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end", paddingBottom: 6 }}>
                      {PICKABLE.map((r) =>
                        chip(`note-share-user-${u.id}-role-${r}`, roleLabel(r), u.role === r, () => {
                          setRolesOpenFor(null);
                          if (u.role !== r) void run(() => setRole.mutateAsync({ id: note.id, userId: u.id, role: r }));
                        }),
                      )}
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </KeyboardPadding>
    </Modal>
  );
}
