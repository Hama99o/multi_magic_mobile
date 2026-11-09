/**
 * PAGES, DRESSED AS A DRIVE — the owner's verdict (2026-11-06): it must look
 * like Google Drive "because people will not understand what to do
 * otherwise". `docs/design/pages/DRIVE_SIDE_BY_SIDE.md` has each screen
 * beside its Drive reference (Mobbin), and what we kept and changed.
 *
 * What is borrowed is the LANGUAGE people already read: the rounded search
 * pill with the avatar, the sort row with the list/grid toggle, a row as
 * "coloured type icon · name · ★ Modified …· ⋯", cards with a big preview,
 * the bottom upload bar, the four tabs. What is NOT borrowed is anything of
 * Google's own: no logo, no Google colours on our chrome (our accent stays
 * the app's teal), our own icon set. The type colours are a convention
 * (PDF red, document blue, sheet green, slides yellow) that file managers
 * share, chosen so a glance tells a PDF from a clip.
 */
import { createElement, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { router } from "expo-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  Clock,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  LayoutGrid,
  List,
  MoreVertical,
  Play,
  Plus,
  Search,
  Star,
  Upload,
  Users,
  X,
  type LucideIcon,
} from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { relativeTime } from "@/lib/relativeTime";
import { Avatar } from "@/screens/people/Avatar";
import { AiButton } from "@/components/AiButton";
import { ProfileSheet } from "@/components/settings/ProfileSheet";
import { useAuthStore } from "@/stores/auth.store";
import { useUploads } from "@/stores/uploads.store";
import type { PageNode } from "@/api/pages";
import { formatBytes } from "../parts";

// ── Type: icon and colour ───────────────────────────────────────────────────

export type FileFamily = "folder" | "page" | "pdf" | "doc" | "sheet" | "slides" | "image" | "video" | "audio" | "archive" | "other";

export function familyOf(node: Pick<PageNode, "kind" | "mimeType" | "title">): FileFamily {
  if (node.kind === "folder") return "folder";
  if (node.kind === "page") return "page";
  const mime = node.mimeType ?? "";
  const name = node.title.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv" || /\.(xlsx?|csv|ods)$/.test(name)) return "sheet";
  if (mime.includes("presentation") || mime.includes("powerpoint") || /\.(pptx?|odp|key)$/.test(name)) return "slides";
  if (mime.includes("word") || mime.includes("opendocument.text") || mime.startsWith("text/") || /\.(docx?|odt|rtf|txt|md)$/.test(name)) return "doc";
  if (mime.includes("zip") || mime.includes("compressed") || mime.includes("tar") || /\.(zip|rar|7z|gz)$/.test(name)) return "archive";
  return "other";
}

const FAMILY_ICON: Record<FileFamily, LucideIcon> = {
  folder: Folder,
  page: FileText,
  pdf: FileText,
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: FileText,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  archive: FileArchive,
  other: File,
};

/** The file-manager convention; the same in both schemes, like Drive's. */
const FAMILY_COLOR: Record<FileFamily, string | null> = {
  folder: null, // the ink's muted tone, set at render
  page: "#4285F4",
  pdf: "#EA4335",
  doc: "#4285F4",
  sheet: "#34A853",
  slides: "#F9AB00",
  image: "#EA4335",
  video: "#EA4335",
  audio: "#A142F4",
  archive: null,
  other: null,
};

export function FileTypeIcon({ node, size = 24 }: { node: Pick<PageNode, "kind" | "mimeType" | "title">; size?: number }) {
  const colors = useColors();
  const family = familyOf(node);
  return createElement(FAMILY_ICON[family], {
    size,
    color: FAMILY_COLOR[family] ?? colors.inkMuted,
    fill: family === "folder" ? colors.inkMuted : "none",
  });
}

// ── View preferences, kept across restarts (Drive keeps the toggle) ─────────

export type ViewMode = "list" | "grid";
const VIEW_KEY = "mm-pages-view-mode";

interface ViewPrefs {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  hydrate: () => Promise<void>;
}

export const useViewPrefs = create<ViewPrefs>((set) => ({
  mode: "list",
  setMode: (mode) => {
    set({ mode });
    void AsyncStorage.setItem(VIEW_KEY, mode).catch(() => {});
  },
  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(VIEW_KEY);
      if (stored === "list" || stored === "grid") set({ mode: stored });
    } catch {
      // The default is fine.
    }
  },
}));

// ── The search pill (Drive's "Search in Drive" with the avatar) ─────────────

export function SearchPill({ onMenu }: { onMenu?: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [profileOpen, setProfileOpen] = useState(false);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: metrics.space.sm,
        minHeight: 52,
        borderRadius: metrics.radius.pill,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: metrics.space.sm,
        marginVertical: metrics.space.sm,
      }}
    >
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
        hitSlop={6}
        style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
        testID="pages-back"
      >
        <ChevronLeft size={22} color={colors.ink} />
      </Pressable>
      <Pressable
        onPress={() => router.push({ pathname: "/pages/drive", params: { view: "search" } })}
        accessibilityRole="search"
        accessibilityLabel={t("pages.searchPill")}
        style={{ flex: 1, minHeight: 44, justifyContent: "center" }}
        testID="pages-open-search"
      >
        <Text tone="muted" numberOfLines={1}>
          {t("pages.searchPill")}
        </Text>
      </Pressable>
      {onMenu ? (
        <IconButton icon={MoreVertical} label={t("pages.menu.title")} onPress={onMenu} testID="pages-menu" />
      ) : null}
      <AiButton compact />
      {/* Drive's avatar opens the account; ours opens the same sheet as Home. */}
      <Pressable
        onPress={() => setProfileOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t("profileMenu.openLabel")}
        hitSlop={6}
        style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
        testID="pages-open-profile"
      >
        <Avatar name={user?.fullName ?? user?.email ?? ""} uri={user?.avatar ?? null} userId={user?.id ?? 0} size={32} />
      </Pressable>
      <ProfileSheet
        visible={profileOpen}
        userId={user?.id ?? null}
        onClose={() => setProfileOpen(false)}
        onSignOut={() => {
          setProfileOpen(false);
          void useAuthStore.getState().signOut().then(() => router.replace("/sign-in"));
        }}
      />
    </View>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  testID,
  tone = "muted",
  selected,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  testID: string;
  tone?: "muted" | "ink" | "accent";
  selected?: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const color = tone === "accent" ? colors.accent : tone === "ink" ? colors.ink : colors.inkMuted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      hitSlop={4}
      style={{ width: metrics.touch - 4, height: metrics.touch - 4, alignItems: "center", justifyContent: "center" }}
      testID={testID}
    >
      <Icon size={22} color={color} />
    </Pressable>
  );
}

// ── The sort row: "Name ↑" on the left, the list/grid toggle on the right ───

export function SortRow({ label, ascending, onSort }: { label: string; ascending: boolean; onSort?: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const mode = useViewPrefs((s) => s.mode);
  const setMode = useViewPrefs((s) => s.setMode);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
      {onSort ? (
        <Pressable
          onPress={onSort}
          accessibilityRole="button"
          accessibilityLabel={t("pages.sort.current", { by: label, order: ascending ? t("pages.sort.asc") : t("pages.sort.desc") })}
          style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs, minHeight: 44 }}
          testID="pages-sort"
        >
          <Text variant="label">{label}</Text>
          {ascending ? <ArrowUp size={16} color={colors.accent} /> : <ArrowDown size={16} color={colors.accent} />}
        </Pressable>
      ) : (
        <Text variant="label" tone="muted">
          {label}
        </Text>
      )}
      <IconButton
        icon={mode === "list" ? LayoutGrid : List}
        label={mode === "list" ? t("pages.view.grid") : t("pages.view.list")}
        onPress={() => setMode(mode === "list" ? "grid" : "list")}
        testID="pages-view-toggle"
      />
    </View>
  );
}

// ── A row (list view) ───────────────────────────────────────────────────────

export function subtitleFor(node: PageNode, t: (key: string, o?: Record<string, unknown>) => string, locale?: string, showSpace = false): string {
  const modified = t("pages.modified", { when: relativeTime(node.updatedAt) });
  const parts: string[] = [];
  if (showSpace && node.space) parts.push(node.space.title);
  if (node.kind === "folder") parts.push(t("pages.itemCount", { count: node.childrenCount }));
  else if (node.kind === "file") parts.push(formatBytes(node.fileSize, t, locale));
  parts.push(modified);
  return parts.join(" · ");
}

/**
 * A page's first lines are its top-left; a centre crop of a wide render cut
 * "Weekend itinerary" to "eekend itinerary" (QA_DEEP #16).
 */
const PAGE_LIKE = new Set<FileFamily>(["pdf", "doc", "sheet", "slides", "page"]);

function Thumb({ node, size, radius }: { node: PageNode; size: number; radius: number }) {
  const colors = useColors();
  const family = familyOf(node);
  if (node.thumbnailUrl) {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, overflow: "hidden", backgroundColor: colors.surface }}>
        <ExpoImage
          source={{ uri: node.thumbnailUrl }}
          style={{ width: size, height: size }}
          contentFit="cover"
          contentPosition={PAGE_LIKE.has(family) ? "top left" : "center"}
          recyclingKey={String(node.id)}
          transition={100}
        />
        {family === "video" ? (
          <View style={{ position: "absolute", left: 4, bottom: 4, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.55)", padding: 3 }}>
            <Play size={10} color="#FFFFFF" fill="#FFFFFF" />
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <FileTypeIcon node={node} size={Math.round(size * 0.6)} />
    </View>
  );
}

export function ListRow({
  node,
  onPress,
  onMore,
  onLongPress,
  selecting,
  selected,
  showSpace,
}: {
  node: PageNode;
  onPress: () => void;
  onMore: () => void;
  onLongPress: () => void;
  selecting: boolean;
  selected: boolean;
  showSpace?: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const subtitle = subtitleFor(node, t, i18n.language, showSpace);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: 64,
        borderRadius: metrics.radius.md,
        backgroundColor: selected ? `${colors.accent}22` : "transparent",
      }}
      testID={`pages-row-${node.kind}`}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={t("pages.rowLabel", { title: node.title, meta: subtitle })}
        accessibilityState={selecting ? { selected } : undefined}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: metrics.space.md, paddingVertical: metrics.space.sm, paddingLeft: metrics.space.xs }}
      >
        {selecting ? (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: selected ? colors.accent : colors.surface,
              borderWidth: selected ? 0 : 2,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {selected ? <Check size={20} color={colors.onAccent} /> : null}
          </View>
        ) : (
          <Thumb node={node} size={40} radius={metrics.radius.sm} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1}>{node.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {node.starred ? <Star size={12} color={colors.inkMuted} fill={colors.inkMuted} /> : null}
            <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {subtitle}
            </Text>
          </View>
        </View>
      </Pressable>
      {selecting ? null : (
        <IconButton icon={MoreVertical} label={t("pages.item.more", { title: node.title })} onPress={onMore} testID={`pages-more-${node.kind}`} />
      )}
    </View>
  );
}

// ── A card (grid view): name row with ⋯ above a big preview, like Drive ────

export function GridCard({
  node,
  width,
  onPress,
  onMore,
  onLongPress,
  selecting,
  selected,
}: {
  node: PageNode;
  width: number;
  onPress: () => void;
  onMore: () => void;
  onLongPress: () => void;
  selecting: boolean;
  selected: boolean;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const previewHeight = node.kind === "folder" ? 0 : Math.round(width * 0.72);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={t("pages.rowLabel", { title: node.title, meta: subtitleFor(node, t, i18n.language) })}
      accessibilityState={selecting ? { selected } : undefined}
      style={{
        width,
        borderRadius: metrics.radius.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: colors.surface,
        overflow: "hidden",
      }}
      testID={`pages-card-${node.kind}`}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingLeft: metrics.space.sm, minHeight: 44 }}>
        {selecting ? (
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: selected ? colors.accent : "transparent", borderWidth: selected ? 0 : 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
            {selected ? <Check size={14} color={colors.onAccent} /> : null}
          </View>
        ) : (
          <FileTypeIcon node={node} size={20} />
        )}
        {/* A folder tile has no preview, so its name gets two lines, as in
            Drive; a file card keeps one, so the previews in a row line up. */}
        <Text variant="label" numberOfLines={node.kind === "folder" ? 2 : 1} style={{ flex: 1, paddingVertical: node.kind === "folder" ? 6 : 0 }}>
          {node.title}
        </Text>
        {selecting ? <View style={{ width: 8 }} /> : <IconButton icon={MoreVertical} label={t("pages.item.more", { title: node.title })} onPress={onMore} testID={`pages-card-more-${node.kind}`} />}
      </View>
      {previewHeight > 0 ? (
        <View style={{ height: previewHeight, backgroundColor: colors.ground, alignItems: "center", justifyContent: "center" }}>
          {node.thumbnailUrl ? (
            <>
              <ExpoImage
                source={{ uri: node.thumbnailUrl }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                contentPosition={PAGE_LIKE.has(familyOf(node)) ? "top left" : "center"}
                recyclingKey={`g${node.id}`}
                transition={100}
              />
              {familyOf(node) === "video" ? (
                <View style={{ position: "absolute", width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
                  <Play size={16} color="#FFFFFF" fill="#FFFFFF" />
                </View>
              ) : null}
            </>
          ) : (
            <FileTypeIcon node={node} size={Math.round(previewHeight * 0.4)} />
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

// ── Selection bar (multi-select): replaces the search pill ─────────────────

export function SelectionBar({ count, onClose, children }: { count: number; onClose: () => void; children: ReactNode }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", minHeight: 52, marginVertical: metrics.space.sm, borderRadius: metrics.radius.pill, backgroundColor: `${colors.accent}22`, paddingHorizontal: metrics.space.xs }}
      testID="pages-selection-bar"
    >
      <IconButton icon={X} label={t("pages.select.clear")} onPress={onClose} tone="ink" testID="pages-select-clear" />
      <Text variant="label" style={{ flex: 1 }} testID="pages-select-count">
        {t("pages.select.count", { count })}
      </Text>
      {children}
    </View>
  );
}

// ── The bottom upload bar (Drive: "Uploading 1 item" above the tabs) ───────

export function UploadBar() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const items = useUploads((s) => s.items);
  const active = items.filter((i) => i.status === "preparing" || i.status === "uploading" || i.status === "queued" || i.status === "checking");
  const failed = items.filter((i) => i.status === "failed").length;
  if (active.length === 0 && failed === 0) return null;
  const total = active.reduce((n, i) => n + i.size, 0);
  const sent = active.reduce((n, i) => n + i.sent, 0);
  const percent = total > 0 ? Math.round((sent / total) * 100) : 0;
  const offline = active.some((i) => i.error === "network" && i.status === "queued");
  // Honest progress (QA_FULL U3): no "0 %" while no byte count is known yet,
  // and "Preparing…" while files are still being copied in.
  const preparing = active.length > 0 && active.every((i) => i.status === "preparing" || (i.status === "queued" && !i.error));
  const title =
    active.length > 0
      ? offline
        ? t("pages.uploads.barWaiting")
        : preparing && active.some((i) => i.status === "preparing")
          ? t("pages.uploads.barPreparing")
          : sent === 0
            ? t("pages.uploads.barSending")
            : t("pages.uploads.barPercent", { percent })
      : t("pages.uploads.bannerFailed", { count: failed });
  const subtitle = active.length > 0 ? t("pages.uploads.barItems", { count: active.length }) : null;
  return (
    <Pressable
      onPress={() => router.push("/pages/uploads")}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border }}
      testID="pages-upload-bar"
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, paddingHorizontal: metrics.space.lg, paddingVertical: metrics.space.sm, minHeight: 56 }}>
        <Upload size={20} color={active.length > 0 ? colors.accent : colors.danger} />
        <View style={{ flex: 1 }}>
          <Text variant="label" tone={active.length > 0 ? "default" : "danger"} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {active.length > 0 ? (
        <View style={{ height: 3, backgroundColor: colors.border }}>
          <View style={{ width: `${percent}%`, height: 3, backgroundColor: colors.accent }} />
        </View>
      ) : null}
    </Pressable>
  );
}

// ── The four tabs inside Pages ──────────────────────────────────────────────

export type PagesTab = "home" | "starred" | "shared" | "files";

export function PagesTabBar({ tab, onTab }: { tab: PagesTab; onTab: (tab: PagesTab) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const tabs: { key: PagesTab; icon: LucideIcon; label: string }[] = [
    { key: "home", icon: Clock, label: t("pages.tabs.home") },
    { key: "starred", icon: Star, label: t("pages.tabs.starred") },
    { key: "shared", icon: Users, label: t("pages.tabs.shared") },
    { key: "files", icon: Folder, label: t("pages.tabs.files") },
  ];
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: "row", borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.ground, paddingBottom: insets.bottom }}
    >
      {tabs.map(({ key, icon: Icon, label }) => {
        const active = key === tab;
        return (
          <Pressable
            key={key}
            onPress={() => onTab(key)}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            style={{ flex: 1, alignItems: "center", paddingVertical: metrics.space.sm, gap: 2, minHeight: 56 }}
            testID={`pages-tab-${key}`}
          >
            <View style={{ paddingHorizontal: 18, paddingVertical: 4, borderRadius: 16, backgroundColor: active ? `${colors.accent}2A` : "transparent" }}>
              <Icon size={22} color={active ? colors.accent : colors.inkMuted} fill={active && key === "starred" ? colors.accent : "none"} />
            </View>
            <Text variant="caption" tone={active ? "accent" : "muted"} style={{ fontWeight: active ? "700" : "400" }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "+" — Drive's floating new button. */
export function NewFab({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("pages.new.title")}
      style={{
        position: "absolute",
        right: metrics.space.lg,
        bottom: metrics.space.lg,
        width: 60,
        height: 60,
        borderRadius: 20,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
        elevation: 6,
        shadowColor: "#000",
        shadowOpacity: 0.22,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      }}
      testID="pages-add"
    >
      <Plus size={30} color={colors.accent} />
    </Pressable>
  );
}

export { Search };
