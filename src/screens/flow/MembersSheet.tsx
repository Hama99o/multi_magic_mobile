/**
 * Who is on a board and with what role — the web's `ProjectMembersDrawer.tsx`.
 *
 * The owner first, with a crown; then each member (or the address invited,
 * "Invite pending"). An owner or admin changes a role, resends an invite and
 * removes someone, each removal CONFIRMED (the web removes on one click,
 * parity audit). Anyone else may leave the board (`ProjectMemberPolicy#destroy?`
 * lets a member remove themself; the web has no button for it).
 *
 * Adding: search the people on MultiMagic (2 letters or more; the owner and
 * those already on the board are left out), or type an address: an address
 * with no account gets an invitation email (`FlowApp::Membership#add!`).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { flowKeys } from "@/api/keys";
import { ASSIGNABLE_ROLES, flowApi, type AssignableRole, type Member, type Project } from "@/api/flow";
import { peopleApi } from "@/api/conversations";
import { failureMessage } from "@/api/failure";
import { BottomSheet } from "@/components/BottomSheet";
import { SheetButton } from "@/components/fields/FieldRow";
import { ChevronDown, Crown, LogOut, MailPlus, RotateCw, Search, Trash2, UserPlus } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useMe } from "@/hooks/useMe";
import { ChoiceSheet } from "@/screens/calendar/ChoiceSheet";
import { powersOf, roleIn } from "./logic";
import { Avatar, FLOW_COLOR } from "./parts";
import { useAddMember, useMemberRole, useRemoveMember, useResendInvite } from "./useFlowMutations";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function MembersSheet({ project, onClose }: { project: Project; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const me = useMe();
  const manage = powersOf(roleIn(project, me?.id)).manage;
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [roleFor, setRoleFor] = useState<Member | null>(null);
  const [adding, setAdding] = useState(false);
  const fail = (fallback: string) => (e: unknown) => setNote({ text: failureMessage(e, fallback), bad: true });

  const members = useQuery({ queryKey: flowKeys.members(project.id), queryFn: () => flowApi.members(project.id) });
  const setRole = useMemberRole(project.id, { onError: fail(t("flow.members.failed")) });
  const remove = useRemoveMember(project.id, { onError: fail(t("flow.members.failed")) });
  const resend = useResendInvite(project.id, { onDone: () => setNote({ text: t("flow.members.resent"), bad: false }), onError: fail(t("flow.members.failed")) });

  const confirmRemove = (m: Member) => {
    const self = m.userId != null && m.userId === me?.id;
    const who = m.name ?? m.invitedEmail ?? "";
    Alert.alert(
      self ? t("flow.members.leaveTitle", { title: project.title }) : m.pending ? t("flow.members.cancelInviteTitle", { who }) : t("flow.members.removeTitle", { who }),
      self ? t("flow.members.leaveBody") : t("flow.members.removeBody"),
      [
        { text: t("fields.cancel"), style: "cancel" },
        {
          text: self ? t("flow.members.leave") : m.pending ? t("flow.members.cancelInvite") : t("flow.members.remove"),
          style: "destructive",
          onPress: () =>
            remove.mutate(m.id, {
              onSuccess: () => {
                if (!self) return;
                onClose();
                router.dismissTo("/flow");
              },
            }),
        },
      ],
    );
  };

  const known = useMemo(() => new Set([project.owner.id, ...(members.data ?? []).flatMap((m) => (m.userId != null ? [m.userId] : []))]), [members.data, project.owner.id]);

  return (
    <BottomSheet
      open
      title={manage ? t("flow.members.manage") : t("flow.members.title")}
      subtitle={project.title}
      onClose={onClose}
      testID="flow-members"
      footer={manage && !adding ? <SheetButton testID="flow-members-add" label={t("flow.members.add")} onPress={() => setAdding(true)} /> : undefined}
    >
      {note ? (
        <Text testID="flow-members-note" tone={note.bad ? "danger" : "accent"} accessibilityLiveRegion="polite" style={{ marginBottom: metrics.space.sm }}>
          {note.text}
        </Text>
      ) : null}
      {adding ? <AddMember projectId={project.id} known={known} onDone={(text) => {
            setAdding(false);
            setNote({ text, bad: false });
          }} onCancel={() => setAdding(false)} onError={fail(t("flow.members.addFailed"))} /> : null}

      <Row name={project.owner.name || t("flow.members.ownerFallback")} line={t("flow.roles.owner")} lead={<Crown size={18} color={FLOW_COLOR} />} testID="flow-member-owner" />
      {members.isPending ? <ActivityIndicator style={{ marginVertical: metrics.space.md }} color={colors.inkMuted} /> : null}
      {members.error ? (
        <Pressable onPress={() => void members.refetch()} accessibilityRole="button" style={{ paddingVertical: metrics.space.md }}>
          <Text tone="danger">{failureMessage(members.error, t("flow.members.loadFailed"))}</Text>
          <Text tone="accent" variant="label">
            {t("fields.retry")}
          </Text>
        </Pressable>
      ) : null}
      {members.data && members.data.length === 0 ? (
        <Text tone="muted" style={{ paddingVertical: metrics.space.sm }} testID="flow-members-empty">
          {t("flow.members.none")}
        </Text>
      ) : null}
      {(members.data ?? []).map((m) => {
        const self = m.userId != null && m.userId === me?.id;
        const name = m.name ?? m.invitedEmail ?? "?";
        return (
          <Row
            key={m.id}
            testID="flow-member"
            name={name}
            line={m.pending ? t("flow.members.pending") : self ? t("flow.members.you") : null}
            trailing={
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {manage ? (
                  <Pressable
                    testID="flow-member-role"
                    onPress={() => setRoleFor(m)}
                    accessibilityRole="button"
                    accessibilityLabel={t("flow.members.roleOf", { who: name, role: t(`flow.roles.${m.role}`) })}
                    style={{ flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44, paddingHorizontal: metrics.space.sm }}
                  >
                    <Text variant="label">{t(`flow.roles.${m.role}`)}</Text>
                    <ChevronDown size={16} color={colors.inkMuted} />
                  </Pressable>
                ) : (
                  <Text variant="caption" tone="muted" style={{ paddingHorizontal: metrics.space.sm }}>
                    {t(`flow.roles.${m.role}`)}
                  </Text>
                )}
                {manage && m.pending ? (
                  <IconButton testID="flow-member-resend" label={t("flow.members.resend", { who: name })} onPress={() => resend.mutate(m.id)}>
                    <RotateCw size={18} color={colors.ink} />
                  </IconButton>
                ) : null}
                {manage && !self ? (
                  <IconButton testID="flow-member-remove" label={m.pending ? t("flow.members.cancelInvite") : t("flow.members.removeWho", { who: name })} onPress={() => confirmRemove(m)}>
                    <Trash2 size={18} color={colors.danger} />
                  </IconButton>
                ) : null}
                {self ? (
                  <IconButton testID="flow-member-leave" label={t("flow.members.leave")} onPress={() => confirmRemove(m)}>
                    <LogOut size={18} color={colors.danger} />
                  </IconButton>
                ) : null}
              </View>
            }
          />
        );
      })}
      <ChoiceSheet<AssignableRole>
        open={roleFor != null}
        title={t("flow.members.role")}
        choices={ASSIGNABLE_ROLES.map((r) => ({ value: r, label: t(`flow.roles.${r}`), hint: t(`flow.roleHints.${r}`) }))}
        value={roleFor?.role ?? "member"}
        onPick={(role) => roleFor && role !== roleFor.role && setRole.mutate({ memberId: roleFor.id, role })}
        onClose={() => setRoleFor(null)}
        testID="flow-role-sheet"
      />
    </BottomSheet>
  );
}

function Row({ name, line, lead, trailing, testID }: { name: string; line: string | null; lead?: ReactNode; trailing?: ReactNode; testID: string }) {
  const metrics = useMetrics();
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 56 }}>
      <Avatar name={name} size={36} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontWeight: "600" }}>
            {name}
          </Text>
          {lead}
        </View>
        {line ? (
          <Text variant="caption" tone="muted">
            {line}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

function IconButton({ label, onPress, children, testID }: { label: string; onPress: () => void; children: ReactNode; testID: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
      {children}
    </Pressable>
  );
}

function AddMember({ projectId, known, onDone, onCancel, onError }: { projectId: number; known: Set<number>; onDone: (text: string) => void; onCancel: () => void; onError: (e: unknown) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const [term, setTerm] = useState("");
  const [who, setWho] = useState<{ userId: number; name: string } | { email: string } | null>(null);
  const [role, setRole] = useState<AssignableRole>("member");
  const [rolePicking, setRolePicking] = useState(false);
  const add = useAddMember(projectId, {
    onDone: (m) => onDone(m.pending ? t("flow.members.invited", { who: m.invitedEmail ?? "" }) : t("flow.members.added", { who: m.name ?? "" })),
    onError,
  });

  useEffect(() => {
    const id = setTimeout(() => setTerm(typed.trim()), 300);
    return () => clearTimeout(id);
  }, [typed]);

  const people = useQuery({ queryKey: flowKeys.peopleSearch(term), queryFn: () => peopleApi.search(term, 1), enabled: term.length >= 2 && !who });
  const found = (people.data?.people ?? []).filter((p) => !known.has(p.id)).slice(0, 6);
  const isEmail = EMAIL.test(term);

  return (
    <View testID="flow-add-member" style={{ gap: metrics.space.sm, padding: metrics.space.md, marginBottom: metrics.space.md, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      {who ? (
        <>
          <Text variant="label">{"email" in who ? t("flow.members.inviteWho", { who: who.email }) : t("flow.members.addWho", { who: who.name })}</Text>
          <Pressable testID="flow-add-role" onPress={() => setRolePicking(true)} accessibilityRole="button" accessibilityLabel={t("flow.members.roleIs", { role: t(`flow.roles.${role}`) })} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.sm, borderWidth: 1, borderColor: colors.border }}>
            <Text>{t(`flow.roles.${role}`)}</Text>
            <ChevronDown size={18} color={colors.inkMuted} />
          </Pressable>
          <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
            <SheetButton testID="flow-add-cancel" label={t("fields.cancel")} tone="neutral" onPress={() => setWho(null)} />
            <SheetButton testID="flow-add-confirm" label={"email" in who ? t("flow.members.sendInvite") : t("flow.members.add")} busy={add.isPending} onPress={() => add.mutate({ who: "email" in who ? { email: who.email } : { userId: who.userId }, role })} />
          </View>
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.sm, paddingHorizontal: metrics.space.md, backgroundColor: colors.ground }}>
            <Search size={18} color={colors.inkMuted} />
            <TextInput
              testID="flow-add-search"
              value={typed}
              onChangeText={setTyped}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder={t("flow.members.searchPlaceholder")}
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel={t("flow.members.searchPlaceholder")}
              style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }}
            />
          </View>
          {term.length >= 2 && people.isFetching ? <ActivityIndicator color={colors.inkMuted} /> : null}
          {found.map((p) => (
            <Pressable key={p.id} testID="flow-add-person" onPress={() => setWho({ userId: p.id, name: p.name })} accessibilityRole="button" accessibilityLabel={t("flow.members.addWho", { who: p.name })} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 48 }}>
              <Avatar name={p.name} size={32} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1}>{p.name}</Text>
                {p.email && p.email !== p.name ? (
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {p.email}
                  </Text>
                ) : null}
              </View>
              <UserPlus size={18} color={colors.accent} />
            </Pressable>
          ))}
          {isEmail ? (
            <Pressable testID="flow-add-email" onPress={() => setWho({ email: term })} accessibilityRole="button" accessibilityLabel={t("flow.members.inviteWho", { who: term })} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 48 }}>
              <MailPlus size={20} color={colors.accent} />
              <Text tone="accent" variant="label" numberOfLines={1} style={{ flex: 1 }}>
                {t("flow.members.inviteWho", { who: term })}
              </Text>
            </Pressable>
          ) : term.length >= 2 && people.data && found.length === 0 ? (
            <Text tone="muted" variant="caption">
              {t("flow.members.noOne")}
            </Text>
          ) : null}
          <Pressable onPress={onCancel} accessibilityRole="button" style={{ alignSelf: "flex-end", minHeight: 40, justifyContent: "center", paddingHorizontal: metrics.space.sm }}>
            <Text tone="muted" variant="label">
              {t("fields.cancel")}
            </Text>
          </Pressable>
        </>
      )}
      <ChoiceSheet<AssignableRole>
        open={rolePicking}
        title={t("flow.members.role")}
        choices={ASSIGNABLE_ROLES.map((r) => ({ value: r, label: t(`flow.roles.${r}`), hint: t(`flow.roleHints.${r}`) }))}
        value={role}
        onPick={setRole}
        onClose={() => setRolePicking(false)}
        testID="flow-add-role-sheet"
      />
    </View>
  );
}
