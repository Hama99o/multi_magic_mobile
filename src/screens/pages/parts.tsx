/**
 * The pieces every Pages screen shares: the header, an item's row, its
 * glyph, and how a size is said. `docs/design/pages/SPEC.md` §2.
 *
 * A row is Dropbox's (mobbin.com/screens/…, cited in the SPEC): a 44 dp
 * thumbnail or glyph, the name on one line, and ONE muted line under it,
 * "size · modified", because that is what tells two clips called IMG_0042
 * apart. Folders lead with their item count instead of a size.
 */
import { createElement, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Play,
  Star,
  type LucideIcon,
} from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { relativeTime } from "@/lib/relativeTime";
import type { PageNode } from "@/api/pages";
import { mediaKind } from "@/lib/mediaKind";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * "1.4 GB" / "1,4 Go" — the unit is a word, so it is translated.
 *
 * In THOUSANDS, as the phone counts (1 KB = 1000 bytes): iOS Files and
 * Photos, and Android's Files, show a 107,247-byte photo as 107 KB, and that
 * is the number he compares Pages with. It used to divide by 1024 and say
 * "105 KB", and a 283 MB clip "270 MB" (`__tests__/helpers.test.ts`).
 */
const UNITS = ["pages.size.kb", "pages.size.mb", "pages.size.gb"] as const;

export function formatBytes(bytes: number | null, t: Translate, locale?: string): string {
  if (bytes == null) return "";
  if (bytes < 1000) return t("pages.size.bytes", { n: bytes });
  let value = bytes / 1000;
  let unit = 0;
  // Rounded, a value can reach 1000 ("1000 KB"): that is the next unit.
  while (unit < UNITS.length - 1 && Math.round(value * 10) / 10 >= 999.5) {
    value /= 1000;
    unit += 1;
  }
  const n = value.toLocaleString(locale, { maximumFractionDigits: value < 10 ? 1 : 0 });
  return t(UNITS[unit], { n });
}

export function iconFor(node: Pick<PageNode, "kind" | "mimeType">): LucideIcon {
  if (node.kind === "folder") return Folder;
  if (node.kind === "page") return FileText;
  const mime = node.mimeType ?? "";
  const kind = mediaKind(mime);
  if (kind === "image") return FileImage;
  if (kind === "video") return FileVideo;
  if (kind === "audio") return FileAudio;
  if (mime.includes("zip") || mime.includes("compressed") || mime.includes("tar")) return FileArchive;
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return FileSpreadsheet;
  if (mime === "application/pdf" || mime.startsWith("text/") || mime.includes("word")) return FileText;
  return File;
}

/**
 * The glyph, chosen by a lookup rather than assigned to a variable during
 * render — React's static-components rule, which would otherwise treat each
 * render's icon as a new component type and remount it.
 */
export function KindIcon({ node, size, color }: { node: Pick<PageNode, "kind" | "mimeType">; size: number; color: string }) {
  return createElement(iconFor(node), { size, color });
}

/** The muted second line of a row. */
export function metaLine(node: PageNode, t: Translate, locale?: string): string {
  const when = relativeTime(node.updatedAt);
  if (node.kind === "folder") return `${t("pages.itemCount", { count: node.childrenCount })} · ${when}`;
  if (node.kind === "page") return `${t("pages.kind.page")} · ${when}`;
  return `${formatBytes(node.fileSize, t, locale)} · ${when}`;
}

export function PagesHeader({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  onBack?: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
      <Pressable
        onPress={onBack ?? (() => router.back())}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
        hitSlop={8}
        style={{ width: 32, height: 32, justifyContent: "center" }}
        testID="pages-back"
      >
        <ChevronLeft size={24} color={colors.ink} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text variant="title" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** A quiet glyph button for a header, at the touch floor. */
export function HeaderButton({
  icon: Icon,
  label,
  onPress,
  testID,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  testID: string;
  badge?: number;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
      testID={testID}
    >
      <Icon size={22} color={colors.inkMuted} />
      {badge ? (
        <View
          style={{
            position: "absolute",
            top: 8,
            right: 6,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            paddingHorizontal: 3,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text variant="caption" tone="onAccent" style={{ fontSize: 10, lineHeight: 12 }}>
            {String(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * "This plays": over a VIDEO'S FRAME only. Once the server makes video
 * previews (multi_magic: ffmpeg in the production image) a clip shows a frame,
 * and a frame alone reads as a photo. A video with no frame keeps its video
 * icon instead, so it never gets a badge. White on a dark disc: drawn over a
 * picture, so it reads the same in light and dark.
 */
export function PlayBadge({ size, corner = false }: { size: number; corner?: boolean }) {
  const pad = corner ? 3 : 0;
  const disc = corner ? undefined : size * 2.25;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        ...(corner ? { left: 4, bottom: 4, padding: pad, borderRadius: 10 } : { width: disc, height: disc, borderRadius: (disc ?? 0) / 2 }),
        backgroundColor: "rgba(0,0,0,0.55)",
        alignItems: "center",
        justifyContent: "center",
      }}
      testID="pages-play-badge"
    >
      <Play size={size} color="#FFFFFF" fill="#FFFFFF" />
    </View>
  );
}

export const isVideo = (node: PageNode): boolean => mediaKind(node.mimeType) === "video";

export function NodeGlyph({ node, size = 44 }: { node: PageNode; size?: number }) {
  const colors = useColors();
  const metrics = useMetrics();
  if (node.thumbnailUrl) {
    return (
      <View style={{ width: size, height: size }}>
        <ExpoImage
          source={{ uri: node.thumbnailUrl }}
          style={{ width: size, height: size, borderRadius: metrics.radius.sm, backgroundColor: colors.surface }}
          contentFit="cover"
          recyclingKey={String(node.id)}
          transition={120}
          accessibilityIgnoresInvertColors
        />
        {isVideo(node) ? <PlayBadge size={size >= 72 ? 16 : 10} corner={size < 72} /> : null}
      </View>
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: metrics.radius.sm,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <KindIcon node={node} size={size * 0.5} color={node.kind === "folder" ? colors.accent : colors.inkMuted} />
    </View>
  );
}

export function NodeRow({
  node,
  onPress,
  onMore,
  showSpace = false,
  testID,
}: {
  node: PageNode;
  onPress: () => void;
  onMore?: () => void;
  showSpace?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const meta = metaLine(node, t, i18n.language);
  const where = showSpace && node.space ? `${node.space.icon ?? ""} ${node.space.title}`.trim() : null;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMore}
      accessibilityRole="button"
      accessibilityLabel={t("pages.rowLabel", { title: node.title, meta })}
      accessibilityHint={node.kind === "folder" ? t("pages.openFolderHint") : t("pages.openHint")}
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, paddingVertical: metrics.space.sm, minHeight: 60 }}
      testID={testID ?? `pages-row-${node.kind}`}
    >
      <NodeGlyph node={node} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
          <Text numberOfLines={1} style={{ flexShrink: 1 }}>
            {node.title}
          </Text>
          {node.starred ? <Star size={14} color={colors.accent} fill={colors.accent} /> : null}
        </View>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {where ? `${where} · ${meta}` : meta}
        </Text>
      </View>
      {node.kind === "folder" ? <ChevronRight size={18} color={colors.inkMuted} /> : null}
    </Pressable>
  );
}

export function Separator() {
  const colors = useColors();
  return <View style={{ height: 1, backgroundColor: colors.border, opacity: 0.5, marginLeft: 56 }} />;
}

export function EmptyLine({ title, body, testID }: { title: string; body?: string; testID: string }) {
  const metrics = useMetrics();
  return (
    <View testID={testID} style={{ paddingVertical: metrics.space.xl * 2, gap: metrics.space.sm }}>
      <Text variant="label">{title}</Text>
      {body ? <Text tone="muted">{body}</Text> : null}
    </View>
  );
}
