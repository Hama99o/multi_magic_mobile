/**
 * Who is in a group, and — for its admins — adding, removing and promoting
 * them. Audit #30, after the web's `components/chat/MembersPanel.tsx`.
 *
 * ── WHAT IS OFFERED, AND TO WHOM: EXACTLY THE WEB'S ─────────────────────────
 * Everybody sees the list and who administers it. Only a group's admins get
 * controls (`conversation.isAdmin`), because the server refuses everybody else
 * (`conversation_policy.rb` `update?`), and offering a command that will be
 * refused is the mistake the web's comment warns about. An admin's controls
 * sit on members who are not admins yet: make admin, and remove. Another admin
 * has none, as on the web — and the server would silently keep the last admin
 * anyway (`conversation.rb#remove_member!`).
 *
 * The web has no "remove admin" and no "leave the group", and the server has
 * no leave route a member could call (`update?` is admins only), so neither
 * is invented here.
 *
 * Removing is confirmed (the web removes on one click; a phone's tap is
 * easier to miss). Each change answers with the conversation, which replaces
 * the thread's cached copy, so the list redraws from the server's word.
 *
 * Adding uses `PeoplePicker`, the same picker that starts a conversation,
 * with the members left out. Its search field keeps the keyboard up, so the
 * whole sheet sits in `KeyboardPadding` (QA rc16: a button hidden under it).
 */
import { useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ShieldCheck, UserPlus, X } from "@/components/icons";
import { KeyboardPadding } from "@/components/KeyboardPadding";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { conversationsApi, type Conversation, type Participant } from "@/api/conversations";
import { conversationKeys } from "@/api/keys";
import { failureMessage } from "@/api/failure";
import { Avatar } from "./Avatar";
import { PeoplePicker } from "./PeoplePicker";

const FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

type Change = { kind: "add" | "admin" | "remove"; userId: number };

export function MembersSheet({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const canManage = conversation.isAdmin;
  const memberIds = useMemo(() => new Set(conversation.participants.map((p) => p.id)), [conversation.participants]);

  const change = useMutation({
    mutationFn: ({ kind, userId }: Change) =>
      kind === "add"
        ? conversationsApi.addMember(conversation.id, userId)
        : kind === "admin"
          ? conversationsApi.makeAdmin(conversation.id, userId)
          : conversationsApi.removeMember(conversation.id, userId),
    onSuccess: (updated) => {
      queryClient.setQueryData<Conversation>(conversationKeys.thread(conversation.id), updated);
      void queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
      setAdding(false);
    },
  });

  const confirmRemove = (member: Participant) => {
    change.reset();
    Alert.alert(t("thread.removeMemberQuestion", { name: member.name }), t("thread.removeMemberBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("thread.removeMemberConfirm"), style: "destructive", onPress: () => change.mutate({ kind: "remove", userId: member.id }) },
    ]);
  };

  const iconButton = { width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" } as const;

  const renderMember = ({ item }: { item: Participant }) => (
    <View
      testID={`member-${item.id}`}
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: metrics.touch, paddingVertical: metrics.space.xs }}
    >
      <Avatar name={item.name} uri={item.avatar} userId={item.id} size={36} isOnline={item.isOnline} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" numberOfLines={1}>
          {item.name}
        </Text>
        {item.isAdmin ? (
          <View testID={`member-${item.id}-admin`} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <ShieldCheck size={12} color={colors.accent} />
            <Text variant="caption" tone="accent">
              {t("thread.admin")}
            </Text>
          </View>
        ) : null}
      </View>
      {canManage && !item.isAdmin ? (
        <>
          <Pressable
            onPress={() => {
              change.reset();
              change.mutate({ kind: "admin", userId: item.id });
            }}
            disabled={change.isPending}
            accessibilityRole="button"
            accessibilityLabel={t("thread.makeAdmin", { name: item.name })}
            hitSlop={4}
            style={iconButton}
          >
            <ShieldCheck size={18} color={colors.inkMuted} />
          </Pressable>
          <Pressable
            onPress={() => confirmRemove(item)}
            disabled={change.isPending}
            accessibilityRole="button"
            accessibilityLabel={t("thread.removeMember", { name: item.name })}
            hitSlop={4}
            style={iconButton}
          >
            <X size={18} color={colors.danger} />
          </Pressable>
        </>
      ) : null}
    </View>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={adding ? () => setAdding(false) : onClose}>
      <KeyboardPadding>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          {/* The scrim is a sibling, not a parent (docs/ACCESSIBILITY.md N1). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            onPress={onClose}
            style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.5)" }}
          />
          <View
            testID="members-sheet"
            style={{
              backgroundColor: colors.ground,
              borderTopLeftRadius: metrics.radius.lg,
              borderTopRightRadius: metrics.radius.lg,
              paddingTop: metrics.space.lg,
              paddingHorizontal: metrics.space.lg,
              paddingBottom: metrics.space.lg + insets.bottom,
              gap: metrics.space.md,
              height: adding ? "85%" : "70%",
              width: "100%",
              maxWidth: metrics.maxMeasure,
              alignSelf: "center",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
              {adding ? (
                <Pressable
                  onPress={() => setAdding(false)}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.back")}
                  hitSlop={10}
                  style={{ width: 32, height: metrics.touch, justifyContent: "center" }}
                >
                  <ChevronLeft size={22} color={colors.ink} />
                </Pressable>
              ) : null}
              <Text variant="title" style={{ flex: 1 }} numberOfLines={1}>
                {adding ? t("thread.addMembers") : t("thread.membersCount", { count: conversation.participants.length })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                hitSlop={10}
                onPress={onClose}
                style={iconButton}
              >
                <X size={22} color={colors.inkMuted} />
              </Pressable>
            </View>

            {change.error ? (
              <Text variant="caption" tone="danger" testID="members-error" accessibilityLiveRegion="polite">
                {failureMessage(change.error, t("thread.membersFailed"))}
              </Text>
            ) : null}

            {adding ? (
              <PeoplePicker
                onPick={(person) => {
                  change.reset();
                  change.mutate({ kind: "add", userId: person.id });
                }}
                exclude={memberIds}
                busyId={change.isPending && change.variables?.kind === "add" ? change.variables.userId : null}
                testIDs={{ search: "members-add-search", list: "members-add-people", loading: "members-add-loading" }}
              />
            ) : (
              <>
                <FlatList
                  testID="members-list"
                  style={{ flex: 1 }}
                  data={conversation.participants}
                  keyExtractor={(p) => String(p.id)}
                  renderItem={renderMember}
                />
                {canManage ? (
                  <Pressable
                    testID="members-add"
                    onPress={() => {
                      change.reset();
                      setAdding(true);
                    }}
                    accessibilityRole="button"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: metrics.space.sm,
                      minHeight: metrics.touch,
                      borderRadius: metrics.radius.md,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    }}
                  >
                    <UserPlus size={18} color={colors.accent} />
                    <Text variant="label" tone="accent">
                      {t("thread.addMembers")}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        </View>
      </KeyboardPadding>
    </Modal>
  );
}
