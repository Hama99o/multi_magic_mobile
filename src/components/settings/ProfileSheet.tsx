/**
 * WHO YOU ARE, AND THE FOUR THINGS THAT BELONG TO THAT.
 *
 * His words: *"move profile button as where we see photo button — when you
 * click you should be able to see go to profile and logout and lang and theme
 * button should be there; when we click it should show bottom side open dialog
 * to choose lang or theme, so we do not mix it in conversation of session."*
 *
 * ── WHAT WAS WRONG, IN ONE SENTENCE ──────────────────────────────────────
 * The theme, the language, your profile, privacy and sign out all lived at the
 * bottom of `SessionsSheet` — the sheet whose subject is CONVERSATIONS. So the
 * list of chats and the controls for the whole account shared one panel, and
 * the only way to change a language was to open a list of conversations. His
 * phrase for it is exact: they were mixed into the conversations of the
 * session. That sheet is now about conversations and nothing else.
 *
 * ── THE PHOTO IS THE BUTTON ──────────────────────────────────────────────
 * Identity is not navigation. The other four header controls are doors to
 * places; this one is "you", so it is your face rather than a glyph —
 * `user_serializer.rb:82` has been sending the photo all along and this client
 * dropped it on the floor. Initials when there is no photo, which `Avatar`
 * already draws from the name.
 *
 * ── ONE MODAL, THREE PANES — NOT THREE MODALS ────────────────────────────
 * Language and theme open "a bottom dialog to choose", as he asked, and they
 * do it by swapping the pane inside THIS sheet rather than by stacking a
 * second `Modal` on top. Stacked modals on Android are a known source of a
 * sheet that will not dismiss and of taps landing on the layer underneath, and
 * `SourceSheet`'s scrim note (`docs/ACCESSIBILITY.md` N1) is the other half of
 * the same lesson: a modal is not free, so this screen keeps exactly one.
 *
 * Each pane has a back arrow to the root, because a chooser that can only be
 * left by dismissing the whole sheet loses the place you came from.
 */
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Pressable, ScrollView, View } from "react-native";
import { SheetFrame } from "@/components/SheetFrame";
import { useNav } from "@/lib/nav";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, LayoutGrid, X } from "@/components/icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { Avatar } from "@/screens/people/Avatar";
import { ThemeRow } from "./ThemeRow";
import { LanguageRow } from "./LanguageRow";
import { DictationRow } from "./DictationRow";
import { useDictationLang } from "@/hooks/useSpeechToText";
import { useMe } from "@/hooks/useMe";
import { APP_REGISTRY, openApp, type AppKey } from "@/apps/registry";
import { AppMark } from "@/components/shell/AppMark";

/** Whether the Apps section is open, per device (a convenience, never state that must survive). */
export const APPS_OPEN_KEY = "profile_apps_open";

/**
 * EVERY APP, IN THE MENU TOO (owner, 2026-11-17: the Profile menu's app list
 * "complete and collapsible"; before, it listed Pages alone). The same
 * registry as the switcher and Home, collapsed by default so the account rows
 * stay where they were, and the choice remembered.
 */
function AppsSection({ current, onOpenApp }: { current: AppKey | undefined; onOpenApp: (key: AppKey) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(APPS_OPEN_KEY)
      .then((v) => alive && v === "1" && setOpen(true))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    void AsyncStorage.setItem(APPS_OPEN_KEY, next ? "1" : "0").catch(() => undefined);
  };
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("shell.apps")}
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={{ minHeight: metrics.touch, flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingHorizontal: metrics.space.sm }}
        testID="profile-apps-toggle"
      >
        <LayoutGrid size={20} color={colors.ink} />
        <Text style={{ flex: 1 }}>{t("shell.apps")}</Text>
        <Chevron size={18} color={colors.inkMuted} />
      </Pressable>
      {open ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: metrics.space.sm, paddingBottom: metrics.space.sm }}>
          {APP_REGISTRY.map((a) => {
            const selected = a.key === current;
            const name = a.key === "home" ? t("shell.home") : t(a.labelKey);
            return (
              <Pressable
                key={a.key}
                accessibilityRole="button"
                accessibilityLabel={name}
                accessibilityState={{ selected }}
                onPress={() => onOpenApp(a.key)}
                style={{ width: "50%", minHeight: metrics.touch, flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingEnd: metrics.space.sm }}
                testID={`profile-app-${a.key}`}
              >
                <AppMark app={a.key} size={28} />
                <Text numberOfLines={1} style={{ flex: 1 }}>
                  {name}
                </Text>
                {selected ? <Check size={18} color={colors.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

type Pane = "root" | "language" | "theme" | "dictation";

/** A row that goes somewhere. The chevron says so without a word. */
function Row({
  label,
  onPress,
  testID,
  tone,
  chevron = false,
}: {
  label: string;
  onPress: () => void;
  testID: string;
  tone?: "muted" | "danger";
  chevron?: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        minHeight: metrics.touch,
        flexDirection: "row",
        alignItems: "center",
        gap: metrics.space.sm,
        paddingHorizontal: metrics.space.sm,
      }}
      testID={testID}
    >
      <Text tone={tone} style={{ flex: 1 }}>
        {label}
      </Text>
      {chevron ? <ChevronRight size={18} color={colors.inkMuted} /> : null}
    </Pressable>
  );
}

export function ProfileSheet({
  visible,
  onClose,
  onSignOut,
  userId,
  currentApp,
  onOpenApp,
}: {
  visible: boolean;
  onClose: () => void;
  onSignOut: () => void;
  /** The app the sheet was opened from: checked in the Apps list. */
  currentApp?: AppKey;
  /** How to switch app; by default down to Home and the app on top, as from inside an app. */
  onOpenApp?: (key: AppKey) => void;
  /** Absent for one launch after a cold start; the language still applies
   *  locally without it — see `LanguageRow`. */
  userId: number | null;
}) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const user = useMe();
  const [pane, setPane] = useState<Pane>("root");
  const dictation = useDictationLang();

  if (!visible) return null;

  const close = () => {
    // Back to the root, so the next open does not resume inside a chooser
    // somebody left three taps ago.
    setPane("root");
    onClose();
  };

  const title =
    pane === "language"
      ? t("profileMenu.language")
      : pane === "theme"
        ? t("profileMenu.appearance")
        : pane === "dictation"
          ? t("dictation.title")
          : (user?.fullName ?? t("profileMenu.title"));

  return (
    <SheetFrame
      visible
      onClose={close}
      closeLabel={t("common.close")}
      testID="profile-sheet"
      style={{ backgroundColor: colors.ground, padding: metrics.space.lg, paddingBottom: metrics.space.xl, gap: metrics.space.md }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
        {pane === "root" ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            hitSlop={10}
            onPress={() => setPane("root")}
            style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
            testID="profile-back"
          >
            <ChevronLeft size={22} color={colors.inkMuted} />
          </Pressable>
        )}
        <Text variant="title" style={{ flex: 1 }} numberOfLines={1}>
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          hitSlop={10}
          onPress={close}
          style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
          testID="profile-close"
        >
          <X size={22} color={colors.inkMuted} />
        </Pressable>
      </View>

      <ScrollView>
        {pane === "root" ? (
          <View style={{ gap: metrics.space.xs }}>
            {/* The face and the address, so it is never a mystery WHICH
                account this is — the one thing a profile menu owes you
                before it offers to sign you out of it. */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: metrics.space.md,
                paddingHorizontal: metrics.space.sm,
                paddingBottom: metrics.space.sm,
              }}
              testID="profile-identity"
            >
              <Avatar
                name={user?.fullName ?? user?.email ?? ""}
                uri={user?.avatar ?? null}
                userId={user?.id ?? 0}
                size={48}
              />
              <Text tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                {user?.email ?? ""}
              </Text>
            </View>

            {/* Every app, collapsible: the switcher's list, for those who
                look for apps under their own name (SPEC §E). It replaces
                the lone Pages row that used to stand here. */}
            <AppsSection
              current={currentApp}
              onOpenApp={(key) => {
                close();
                if (onOpenApp) onOpenApp(key);
                else openApp(key, { current: currentApp ?? "assistant", subScreen: true });
              }}
            />
            <Row
              label={t("sessions.yourProfile")}
              onPress={() => {
                close();
                router.push("/profile");
              }}
              testID="profile-open-profile"
            />
            <Row
              label={t("sessions.privacyAndAccount")}
              onPress={() => {
                close();
                router.push("/account");
              }}
              testID="profile-open-account"
            />

            {/* The two choosers. A chevron rather than the choice inline:
                the root of this sheet is a menu, and a menu that also holds
                two radio groups is the mixing he objected to, moved. */}
            <Row
              label={t("profileMenu.language")}
              onPress={() => setPane("language")}
              testID="profile-open-language"
              chevron
            />
            <Row
              label={t("profileMenu.appearance")}
              onPress={() => setPane("theme")}
              testID="profile-open-theme"
              chevron
            />
            {/* His: "we should be able to choose french or english" for
                dictation. The only way to change it used to be a long
                press on the mic, which nothing announced. */}
            <Row
              label={t("dictation.title")}
              onPress={() => setPane("dictation")}
              testID="profile-open-dictation"
              chevron
            />

            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.border,
                marginTop: metrics.space.sm,
                paddingTop: metrics.space.xs,
              }}
            >
              <Row
                label={t("sessions.signOut")}
                onPress={() => {
                  setPane("root");
                  onSignOut();
                }}
                testID="profile-sign-out"
                tone="muted"
              />
            </View>
          </View>
        ) : pane === "language" ? (
          <View testID="profile-language-pane">
            <LanguageRow userId={userId} />
          </View>
        ) : pane === "dictation" ? (
          <View testID="profile-dictation-pane">
            <DictationRow lang={dictation.lang} onChange={dictation.setLang} />
          </View>
        ) : (
          <View testID="profile-theme-pane">
            <ThemeRow />
          </View>
        )}
      </ScrollView>
    </SheetFrame>
  );
}
