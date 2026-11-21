/**
 * THE ONE HEADER ON EVERY APP (owner, 2026-11-17: "the top must be identical
 * everywhere, for a consistent UX", the same as the web's `TopNav`).
 * docs/design/app-shell/SPEC.md §C.
 *
 *   [◆ or ‹]  App name ……………   [Chats •3] [Bell •12] [Apps] [(avatar)]
 *
 * - Left: on an app's root, the app's own colour badge, which goes Home (the
 *   web's logo); on a screen inside an app, a back chevron instead.
 * - The right side is the web's order: Chats, Notifications, AI, Apps,
 *   Avatar (src/components/shell/CLAUDE.md). Search and Workspace stay off a
 *   phone, as the web hides Workspace on phones too. Room at 360 dp comes from
 *   shrinking the buttons, never from dropping one.
 * - Below it, each app keeps its own row (search, tabs, ⋮): this component is
 *   only the top.
 *
 * Not drawn on focused surfaces (the note editor, a chat thread, the
 * assistant, modals, lock screens): the web's rule, pages outside MainLayout
 * draw their own chrome.
 */
import { useCallback, useRef, useState } from "react";
import { I18nManager, Pressable, View, useWindowDimensions } from "react-native";
import { useNav } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { Bell, ChevronLeft, LayoutGrid, MessageSquare, Sparkles, type LucideIcon, Search } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useMe } from "@/hooks/useMe";
import { useShellBadges } from "@/hooks/useShellBadges";
import { useAndroidBackToHome } from "@/hooks/useBackToHome";
import { useAuthStore } from "@/stores/auth.store";
import { Avatar } from "@/screens/people/Avatar";
import { ProfileSheet } from "@/components/settings/ProfileSheet";
import { appEntry, capBadge, goHomeFromApp, openApp, type AppKey } from "@/apps/registry";
import { SPLIT_AT } from "@/screens/contacts/split";
import { AppMark } from "./AppMark";
import { AppSwitcher } from "./AppSwitcher";

export const HEADER_HEIGHT = 56;
const BUTTON = 40;
/** Below this width the five buttons shrink to 36 dp, so the name keeps room (src/components/shell/CLAUDE.md). */
export const COMPACT_BELOW = 400;
const COMPACT_BUTTON = 36;
/** Below this width the name would get under ~56 dp: the app's badge stands for it (and is read aloud with it). */
export const BADGE_ONLY_BELOW = 340;
/** The app's name: 17 sp, shrinking to fit down to 75 % before it would ever ellipsize (French "Notifications" at 340 dp). */
export const TITLE_SIZE = 17;
export const TITLE_MIN_SCALE = 0.75;
const MARK = 32;
/** Screens lay the header out inside their 16 dp gutter. */
const GUTTER = 16;
/** Between the badge, the title and the buttons; tighter on a compact phone. */
const gapFor = (width: number) => (width < COMPACT_BELOW ? 6 : 8);
/** Between the five buttons: none on a compact phone (each keeps its 36 dp). */
const buttonGapFor = (width: number) => (width < COMPACT_BELOW ? 0 : 4);
const buttonFor = (width: number) => (width < COMPACT_BELOW ? COMPACT_BUTTON : BUTTON);

/** The dp a phone of `width` leaves for the app's name, after the badge, the gaps and the five buttons. */
export function titleRoom(width: number): number {
  return width - 2 * GUTTER - MARK - 2 * gapFor(width) - 5 * buttonFor(width) - 4 * buttonGapFor(width);
}

function HeaderButton({
  icon: Icon,
  label,
  name,
  badge,
  selected = false,
  tinted = false,
  size,
  onPress,
  testID,
}: {
  icon: LucideIcon;
  /** What a screen reader says (the count included). */
  label: string;
  /** The word beside the icon on a tablet (the web shows labels from `lg`). */
  name: string | null;
  badge?: string | null;
  selected?: boolean;
  /** The assistant's button: always tinted, as the web's AI pill. */
  tinted?: boolean;
  size: number;
  onPress: () => void;
  testID: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const lit = selected || tinted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={() => {
        // Already here: the button says so, and does nothing.
        if (!selected) onPress();
      }}
      hitSlop={{ top: 6, bottom: 6, left: size >= BUTTON ? 2 : 0, right: size >= BUTTON ? 2 : 0 }}
      android_ripple={{ color: colors.border, borderless: true, radius: size / 2 }}
      style={{
        width: name ? undefined : size,
        height: size,
        paddingHorizontal: name ? metrics.space.md : 0,
        flexDirection: "row",
        gap: 6,
        borderRadius: metrics.radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: lit ? `${colors.accent}2e` : "transparent",
      }}
      testID={testID}
    >
      <Icon size={size >= BUTTON ? 22 : 20} color={lit ? colors.accent : colors.ink} />
      {name ? (
        <Text variant="label" style={{ color: lit ? colors.accent : colors.ink }} numberOfLines={1} testID={`${testID}-label`}>
          {name}
        </Text>
      ) : null}
      {badge ? (
        <View
          style={{
            position: name ? "relative" : "absolute",
            top: name ? 0 : 2,
            right: name ? 0 : -2,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 4,
            borderWidth: 2,
            borderColor: colors.ground,
            backgroundColor: colors.danger,
            alignItems: "center",
            justifyContent: "center",
          }}
          testID={`${testID}-badge`}
        >
          <Text variant="caption" style={{ color: "#ffffff", fontSize: 10, lineHeight: 12, fontWeight: "700" }}>
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** How long a navigation tap stays the only one (the screen it opens is still sliding in). */
export const SINGLE_FIRE_MS = 800;

/**
 * Every navigation a tap starts fires once (src/components/shell/CLAUDE.md,
 * the black-box run: a double tap on the bell pushed Notifications twice, so
 * back showed it again). A second press inside the window does nothing.
 */
export function useSingleFire(): (run: () => void) => void {
  const last = useRef(0);
  return useCallback((run: () => void) => {
    const now = Date.now();
    if (now - last.current < SINGLE_FIRE_MS) return;
    last.current = now;
    run();
  }, []);
}

/** Android's back at an app's root with nothing behind goes Home; a sub-screen leaves it to the stack. */
function RootBackKey() {
  useAndroidBackToHome();
  return null;
}

// The header is one `flexDirection: "row"`, which React Native mirrors by itself
// in a right-to-left language: the badge goes right, the buttons left, in
// mirrored order. Only the chevron needs flipping by hand.
export function AppHeader({
  app,
  title,
  back = false,
  onBack,
}: {
  app: AppKey;
  /** The screen's own name inside the app; the app's name when absent. */
  title?: string;
  /** A screen inside the app: a back chevron instead of the app's badge. */
  back?: boolean;
  /** Replaces the default back (a confirm before leaving unsaved changes). */
  onBack?: () => void;
}) {
  const router = useNav();
  const colors = useColors();
  const { t } = useTranslation();
  const me = useMe();
  const badges = useShellBadges();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { width } = useWindowDimensions();
  const tablet = width >= SPLIT_AT;
  const size = buttonFor(width);
  const badgeOnly = width < BADGE_ONLY_BELOW;
  const entry = appEntry(app);
  const name = title ?? (app === "home" ? t("home.title") : t(entry.labelKey));
  const chats = capBadge(badges.chats, 9);
  const notifications = capBadge(badges.notifications, 99);

  const once = useSingleFire();
  const goBack = () =>
    once(() => {
      if (onBack) return onBack();
      if (router.canGoBack()) router.back();
      else router.replace(entry.route);
    });
  const open = (key: AppKey) => once(() => openApp(key, { current: app, subScreen: back }));

  return (
    <View
      accessibilityRole="toolbar"
      style={{
        height: HEADER_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: gapFor(width),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.ground,
      }}
      testID="app-header"
    >
      {back || app === "home" ? null : <RootBackKey />}
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          hitSlop={8}
          onPress={goBack}
          android_ripple={{ color: colors.border, borderless: true, radius: BUTTON / 2 }}
          style={{ width: BUTTON, height: BUTTON, alignItems: "center", justifyContent: "center", marginStart: -8 }}
          testID="header-back"
        >
          <View testID="header-back-icon" style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ChevronLeft size={26} color={colors.ink} />
          </View>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={badgeOnly ? `${name}, ${t("shell.goHome")}` : t("shell.goHome")}
          hitSlop={6}
          onPress={app === "home" ? undefined : () => once(goHomeFromApp)}
          disabled={app === "home"}
          testID="header-home"
        >
          <AppMark app={app} size={MARK} />
        </Pressable>
      )}

      {badgeOnly ? (
        <View style={{ flex: 1 }} />
      ) : (
        <Text
          variant="label"
          accessibilityRole="header"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={TITLE_MIN_SCALE}
          ellipsizeMode="tail"
          style={{ flex: 1, fontSize: TITLE_SIZE, lineHeight: 22 }}
          testID="header-title"
        >
          {name}
        </Text>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: buttonGapFor(width) }} testID="header-buttons">
        {/* The web's TopNav search key, first and icon only, as there. Tablets
            only: on a phone a sixth key would cut an app's name, so search
            opens from Home and the Apps sheet (docs/design/search/SPEC.md §C). */}
        {tablet ? (
          <HeaderButton icon={Search} label={t("search.open")} name={null} size={size} onPress={() => once(() => router.push("/search"))} testID="header-search" />
        ) : null}
        <HeaderButton
          icon={MessageSquare}
          label={badges.chats ? t("shell.chatsWaiting", { count: badges.chats }) : t("chat.chats")}
          name={tablet ? t("chat.chats") : null}
          badge={chats}
          selected={app === "chats"}
          size={size}
          onPress={() => once(() => router.push("/chats"))}
          testID="header-chats"
        />
        <HeaderButton
          icon={Bell}
          label={badges.notifications ? t("shell.notificationsUnread", { count: badges.notifications }) : t("chat.notifications")}
          name={tablet ? t("chat.notifications") : null}
          badge={notifications}
          selected={app === "notifications"}
          size={size}
          onPress={() => once(() => router.push("/notifications"))}
          testID="header-notifications"
        />
        {/* The web's AI button (owner, 2026-11-17: "it's important, same as
            we have in web"): the assistant opens OVER this screen, a modal,
            so the screen stays as it was underneath. */}
        <HeaderButton
          icon={Sparkles}
          label={t("home.askAi")}
          name={tablet ? t("home.ai") : null}
          tinted
          size={size}
          onPress={() => once(() => router.push("/chat"))}
          testID="header-ai"
        />
        <HeaderButton icon={LayoutGrid} label={t("shell.apps")} name={tablet ? t("shell.apps") : null} size={size} onPress={() => setSwitcherOpen(true)} testID="header-apps" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("profileMenu.openLabel")}
          hitSlop={4}
          onPress={() => setProfileOpen(true)}
          style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
          testID="header-profile"
        >
          <Avatar name={me?.fullName ?? me?.email ?? ""} uri={me?.avatar ?? null} userId={me?.id ?? 0} size={size - 6} />
        </Pressable>
      </View>

      <AppSwitcher
        visible={switcherOpen}
        current={app}
        badges={{ chats, notifications }}
        onClose={() => setSwitcherOpen(false)}
        onOpen={(key) => {
          setSwitcherOpen(false);
          open(key);
        }}
      />
      <ProfileSheet
        visible={profileOpen}
        userId={me?.id ?? null}
        currentApp={app}
        onOpenApp={(key) => {
          setProfileOpen(false);
          open(key);
        }}
        onClose={() => setProfileOpen(false)}
        onSignOut={() => {
          setProfileOpen(false);
          void useAuthStore.getState().signOut().then(() => router.replace("/sign-in"));
        }}
      />
    </View>
  );
}
