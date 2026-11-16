/**
 * SHARE A SPACE OR ONE ITEM (audit #14) — the web's `ShareDialog.tsx`, as a
 * phone sheet. Same three parts, in the web's order:
 *
 * 1. INVITE: an email and a permission (`viewer`, `editor`, `admin`, the
 *    server's enum). An address with no account is invited by email and shows
 *    as pending; the server says which happened (`state`) and the sheet says
 *    it back, as the web's toasts do. A refusal (yourself, a bad address,
 *    already shared) is the server's own sentence, shown as is.
 * 2. LINK: a permission and the web's three expiries (none, 7 days, 30 days).
 *    Created, it is copied at once (the web does the same), with the success
 *    haptic. Each link lists its permission, its expiry and how many people
 *    are in through it; copy or revoke. Revoking asks first; when people came
 *    in through it, whether they keep their access is the owner's call, the
 *    web's two buttons.
 * 3. PEOPLE WITH ACCESS: name, email, pending invites (resend), permission
 *    (tap to change), remove (asked first: the web removes on one click; on a
 *    phone a stray tap is too easy).
 *
 * Offered to the space's owner only (`permissions.ts` `canShare`, the
 * server's `SharePolicy`). Changing a permission swaps the sheet's content for
 * the choice instead of opening a second modal over this one.
 *
 * Rises with the keyboard (`KeyboardPadding`): it has an email field.
 */
import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { FILL } from "@/theme/fill";
import { Check, ChevronDown, ChevronLeft, Copy, RotateCw, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { KeyboardPadding } from "@/components/KeyboardPadding";
import { useColors, useMetrics } from "@/hooks/useColors";
import { failureMessage } from "@/api/failure";
import { linkUrl, SHARE_PERMISSIONS, type PageShare, type ShareLink, type SharePermission, type ShareTarget } from "@/api/pageShares";
import { LINK_EXPIRIES, useShareLinks, useShares, useSharingMutations, type LinkExpiry } from "./useSharing";

export interface ShareSheetTarget extends ShareTarget {
  /** The space's or the item's name, under the sheet's title. */
  title: string;
}

export function ShareSheet({ target, onClose }: { target: ShareSheetTarget | null; onClose: () => void }) {
  if (!target) return null;
  // Keyed on the target: a new target starts with an empty form.
  return <ShareSheetBody key={`${target.spaceId}:${target.nodeId ?? ""}`} target={target} onClose={onClose} />;
}

const EMAIL = /^\S+@\S+\.\S+$/;

function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={4}
      style={{
        minHeight: 36,
        justifyContent: "center",
        paddingHorizontal: metrics.space.md,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accent : colors.surface,
      }}
      testID={testID}
    >
      <Text variant="label" tone={selected ? "onAccent" : "default"}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="caption" tone="muted" accessibilityRole="header" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
      {children}
    </Text>
  );
}

function ShareSheetBody({ target, onClose }: { target: ShareSheetTarget; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const where: ShareTarget = { spaceId: target.spaceId, nodeId: target.nodeId };
  const people = useShares(where);
  const links = useShareLinks(where);
  const m = useSharingMutations(where);

  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<SharePermission>("viewer");
  const [linkPermission, setLinkPermission] = useState<SharePermission>("viewer");
  const [expiry, setExpiry] = useState<LinkExpiry>("never");
  const [picking, setPicking] = useState<PageShare | null>(null);
  // One line for the last outcome: what the web says in a toast.
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  const say = (text: string) => setNotice({ text, error: false });
  const fail = (e: unknown) => setNotice({ text: failureMessage(e, t("pages.share.failed")), error: true });

  const permissionLabel: Record<SharePermission, string> = {
    viewer: t("pages.share.viewer"),
    editor: t("pages.share.editor"),
    admin: t("pages.share.admin"),
  };
  const expiryLabel: Record<LinkExpiry, string> = {
    never: t("pages.share.expiryNever"),
    "7d": t("pages.share.expiry7d"),
    "30d": t("pages.share.expiry30d"),
  };

  const validEmail = EMAIL.test(email.trim());
  const invite = () => {
    if (!validEmail || m.invite.isPending) return;
    setNotice(null);
    m.invite.mutate(
      { email, permission },
      {
        onSuccess: ({ share, state }) => {
          say(
            state === "invited"
              ? t("pages.share.inviteSentTo", { email: share.email })
              : state === "updated"
                ? t("pages.share.updated")
                : t("pages.share.addedTo", { email: share.email }),
          );
          setEmail("");
          setPermission("viewer");
        },
        onError: fail,
      },
    );
  };

  const copy = (link: Pick<ShareLink, "path">) => {
    void Clipboard.setStringAsync(linkUrl(link));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  const createLink = () => {
    setNotice(null);
    m.createLink.mutate(
      { permission: linkPermission, expiry },
      {
        onSuccess: (link) => {
          copy(link);
          say(t("pages.share.linkCreated"));
        },
        onError: fail,
      },
    );
  };

  const revokeLink = (link: ShareLink) => {
    const go = (revokeAccess: boolean) => () => {
      setNotice(null);
      m.revokeLink.mutate(
        { linkId: link.id, revokeAccess },
        {
          onSuccess: (count) => say(count > 0 ? t("pages.share.linkRevokedWithAccess", { count }) : t("pages.share.linkRevoked")),
          onError: fail,
        },
      );
    };
    const cancel = { text: t("common.cancel"), style: "cancel" as const };
    if (link.grantedCount > 0) {
      Alert.alert(t("pages.share.linkRevoke"), t("pages.share.linkRevokeExplain", { count: link.grantedCount }), [
        cancel,
        { text: t("pages.share.linkRevokeKeepAccess"), onPress: go(false) },
        { text: t("pages.share.linkRevokeAndRemove", { count: link.grantedCount }), style: "destructive", onPress: go(true) },
      ]);
    } else {
      Alert.alert(t("pages.share.linkRevoke"), t("pages.share.linkRevokeBody"), [
        cancel,
        { text: t("pages.share.linkRevokeConfirm"), style: "destructive", onPress: go(false) },
      ]);
    }
  };

  const remove = (share: PageShare) => {
    const who = share.name ?? share.email;
    const go = () => {
      setNotice(null);
      m.remove.mutate(share, { onSuccess: () => say(share.pending ? t("pages.share.inviteCancelled") : t("pages.share.removed")), onError: fail });
    };
    if (share.pending) {
      Alert.alert(t("pages.share.cancelInviteTitle", { email: share.email }), t("pages.share.cancelInviteBody"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("pages.share.cancelInvite"), style: "destructive", onPress: go },
      ]);
    } else {
      Alert.alert(t("pages.share.removeTitle", { name: who }), t("pages.share.removeBody"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("pages.share.remove"), style: "destructive", onPress: go },
      ]);
    }
  };

  const resend = (share: PageShare) => {
    setNotice(null);
    m.resend.mutate(share, { onSuccess: (s) => say(t("pages.share.inviteResentTo", { email: s.email })), onError: fail });
  };

  const pick = (share: PageShare, next: SharePermission) => {
    setPicking(null);
    if (next === share.permission) return;
    setNotice(null);
    m.change.mutate({ share, permission: next }, { onSuccess: () => say(t("pages.share.updated")), onError: fail });
  };

  const linkMeta = (link: ShareLink) =>
    [
      permissionLabel[link.permission],
      link.expired
        ? t("pages.share.linkExpired")
        : link.expiresAt
          ? t("pages.share.linkExpires", { date: new Date(link.expiresAt).toLocaleDateString(i18n.language, { dateStyle: "medium" }) })
          : t("pages.share.expiryNever"),
      ...(link.grantedCount > 0 ? [t("pages.share.linkJoined", { count: link.grantedCount })] : []),
    ].join(" · ");

  const field = {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: metrics.radius.md,
    paddingHorizontal: metrics.space.md,
    color: colors.ink,
    backgroundColor: colors.surface,
    fontSize: 16,
  };
  const iconButton = { width: 44, height: 44, alignItems: "center" as const, justifyContent: "center" as const };

  const shares = people.data ?? [];
  const linkRows = links.data ?? [];

  const picker = picking ? (
    <View style={{ paddingHorizontal: metrics.space.xl, gap: metrics.space.sm }} testID="pages-share-picker">
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
        <Pressable onPress={() => setPicking(null)} accessibilityRole="button" accessibilityLabel={t("common.back")} style={iconButton} testID="pages-share-picker-back">
          <ChevronLeft size={22} color={colors.ink} />
        </Pressable>
        <Text variant="label" numberOfLines={2} style={{ flex: 1 }} accessibilityRole="header">
          {t("pages.share.changeAccess", { name: picking.name ?? picking.email })}
        </Text>
      </View>
      {SHARE_PERMISSIONS.map((p) => (
        <Pressable
          key={p}
          onPress={() => pick(picking, p)}
          accessibilityRole="button"
          accessibilityLabel={permissionLabel[p]}
          accessibilityState={{ selected: picking.permission === p }}
          style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 52 }}
          testID={`pages-share-pick-${p}`}
        >
          <Text style={{ flex: 1 }}>{permissionLabel[p]}</Text>
          {picking.permission === p ? <Check size={20} color={colors.accent} /> : null}
        </Pressable>
      ))}
    </View>
  ) : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={picking ? () => setPicking(null) : onClose}>
      <KeyboardPadding>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.45)" }} />
          <View
            style={{
              backgroundColor: colors.ground,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: metrics.space.lg,
              paddingBottom: metrics.space.md + insets.bottom,
              width: "100%",
              maxWidth: metrics.maxMeasure,
              alignSelf: "center",
              maxHeight: "90%",
            }}
            testID="pages-share-sheet"
          >
            {picker ?? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: metrics.space.xl, gap: metrics.space.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="label" accessibilityRole="header">
                      {t("pages.share.title")}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {target.title}
                    </Text>
                  </View>
                  <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")} style={iconButton} testID="pages-share-close">
                    <X size={20} color={colors.inkMuted} />
                  </Pressable>
                </View>

                {notice ? (
                  <Text tone={notice.error ? "danger" : "default"} accessibilityLiveRegion="polite" testID={notice.error ? "pages-share-error" : "pages-share-notice"}>
                    {notice.text}
                  </Text>
                ) : null}

                {/* 1. Invite */}
                <SectionTitle>{t("pages.share.invite")}</SectionTitle>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t("pages.share.emailPlaceholder")}
                  placeholderTextColor={colors.inkMuted}
                  accessibilityLabel={t("pages.share.emailPlaceholder")}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="send"
                  onSubmitEditing={invite}
                  style={field}
                  testID="pages-share-email"
                />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
                  {SHARE_PERMISSIONS.map((p) => (
                    <Chip key={p} label={permissionLabel[p]} selected={permission === p} onPress={() => setPermission(p)} testID={`pages-share-perm-${p}`} />
                  ))}
                </View>
                <Button label={t("pages.share.inviteButton")} busy={m.invite.isPending} disabled={!validEmail} onPress={invite} testID="pages-share-invite" />

                {/* 2. Link */}
                <SectionTitle>{t("pages.share.link")}</SectionTitle>
                {linkRows.map((link) => (
                  <View key={link.id} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }} testID={`pages-share-link-${link.id}`}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} selectable>
                        {linkUrl(link)}
                      </Text>
                      <Text variant="caption" tone={link.expired ? "danger" : "muted"} testID={`pages-share-link-${link.id}-meta`}>
                        {linkMeta(link)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => (copy(link), say(t("pages.share.linkCopied")))}
                      accessibilityRole="button"
                      accessibilityLabel={t("pages.share.copyLink")}
                      style={iconButton}
                      testID={`pages-share-link-${link.id}-copy`}
                    >
                      <Copy size={20} color={colors.inkMuted} />
                    </Pressable>
                    <Pressable
                      onPress={() => revokeLink(link)}
                      accessibilityRole="button"
                      accessibilityLabel={t("pages.share.linkRevoke")}
                      style={iconButton}
                      testID={`pages-share-link-${link.id}-revoke`}
                    >
                      <X size={20} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
                  {SHARE_PERMISSIONS.map((p) => (
                    <Chip key={p} label={permissionLabel[p]} selected={linkPermission === p} onPress={() => setLinkPermission(p)} testID={`pages-share-link-perm-${p}`} />
                  ))}
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
                  {LINK_EXPIRIES.map((x) => (
                    <Chip key={x} label={expiryLabel[x]} selected={expiry === x} onPress={() => setExpiry(x)} testID={`pages-share-expiry-${x}`} />
                  ))}
                </View>
                <Button label={t("pages.share.createLink")} tone="neutral" busy={m.createLink.isPending} onPress={createLink} testID="pages-share-create-link" />
                <Text variant="caption" tone="muted">
                  {t("pages.share.linkHint")}
                </Text>

                {/* 3. People with access */}
                <SectionTitle>{t("pages.share.access")}</SectionTitle>
                {people.isLoading ? (
                  <ActivityIndicator color={colors.inkMuted} />
                ) : people.error ? (
                  <Text tone="danger">{failureMessage(people.error, t("pages.share.loadFailed"))}</Text>
                ) : shares.length === 0 ? (
                  <Text tone="muted" testID="pages-share-nobody">
                    {t("pages.share.nobody")}
                  </Text>
                ) : (
                  shares.map((share) => (
                    <View key={share.id} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }} testID={`pages-share-person-${share.id}`}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        {share.name ? <Text numberOfLines={1}>{share.name}</Text> : null}
                        <Text variant={share.name ? "caption" : "body"} tone={share.name ? "muted" : "default"} numberOfLines={1}>
                          {share.email}
                        </Text>
                        {share.pending ? (
                          <Text variant="caption" tone="accent" testID={`pages-share-person-${share.id}-pending`}>
                            {t("pages.share.pending")}
                          </Text>
                        ) : null}
                      </View>
                      {share.pending ? (
                        <Pressable
                          onPress={() => resend(share)}
                          disabled={m.resend.isPending}
                          accessibilityRole="button"
                          accessibilityLabel={t("pages.share.resend")}
                          style={iconButton}
                          testID={`pages-share-person-${share.id}-resend`}
                        >
                          <RotateCw size={18} color={colors.inkMuted} />
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => setPicking(share)}
                        accessibilityRole="button"
                        accessibilityLabel={t("pages.share.changeAccess", { name: share.name ?? share.email })}
                        style={{ flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44, paddingHorizontal: metrics.space.xs }}
                        testID={`pages-share-person-${share.id}-perm`}
                      >
                        <Text variant="label">{permissionLabel[share.permission]}</Text>
                        <ChevronDown size={16} color={colors.inkMuted} />
                      </Pressable>
                      <Pressable
                        onPress={() => remove(share)}
                        accessibilityRole="button"
                        accessibilityLabel={share.pending ? t("pages.share.cancelInvite") : t("pages.share.remove")}
                        style={iconButton}
                        testID={`pages-share-person-${share.id}-remove`}
                      >
                        <X size={18} color={colors.inkMuted} />
                      </Pressable>
                    </View>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardPadding>
    </Modal>
  );
}
