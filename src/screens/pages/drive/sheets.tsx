/**
 * The bottom sheets of the Drive-style Pages: "+ New", an item's "⋯"
 * actions, its Details, and Move. Each mirrors its Drive counterpart
 * (`docs/design/pages/DRIVE_SIDE_BY_SIDE.md`): a header naming the item,
 * then one action per row with its icon, destructive last and in red.
 *
 * Not offered, and why (the side-by-side says the same):
 * - "Make available offline": the app has no offline store of Pages yet;
 *   offering a switch that does nothing would be worse than its absence.
 * - "New page": creating a page needs the page editor (phase 3).
 * - "Copy link" / "Manage access": sharing with people is phase 4.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { FILL } from "@/theme/fill";
import { Camera, ChevronRight, Download, File, Folder, FolderInput, FolderPlus, Images, Info, Pencil, Star, StarOff, Trash2, type LucideIcon } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { pagesApi, type PageNode } from "@/api/pages";
import { relativeTime } from "@/lib/relativeTime";
import { formatBytes } from "../parts";
import { FileTypeIcon, familyOf, type FileFamily } from "./ui";

export function BottomSheet({ open, onClose, children, testID }: { open: boolean; onClose: () => void; children: ReactNode; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.45)" }} />
        <View
          style={{
            backgroundColor: colors.ground,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: metrics.space.sm,
            paddingBottom: metrics.space.md + insets.bottom,
            width: "100%",
            maxWidth: metrics.maxMeasure,
            alignSelf: "center",
            maxHeight: "85%",
          }}
          testID={testID}
        >
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: metrics.space.sm }} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function SheetRow({ icon: Icon, label, onPress, danger, testID, busy }: { icon: LucideIcon; label: string; onPress: () => void; danger?: boolean; testID: string; busy?: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.lg, minHeight: 52, paddingHorizontal: metrics.space.xl }}
      testID={testID}
    >
      {busy ? <ActivityIndicator color={colors.inkMuted} /> : <Icon size={22} color={danger ? colors.danger : colors.inkMuted} />}
      <Text tone={danger ? "danger" : "default"}>{label}</Text>
    </Pressable>
  );
}

function SheetHeader({ node }: { node: PageNode }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, paddingHorizontal: metrics.space.xl, paddingBottom: metrics.space.md, borderBottomWidth: 1, borderColor: colors.border, marginBottom: metrics.space.xs }}>
      <FileTypeIcon node={node} size={22} />
      <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
        {node.title}
      </Text>
    </View>
  );
}

// ── "+ New" ─────────────────────────────────────────────────────────────────

/** Long enough for a `slide` Modal to leave the screen. */
export const SHEET_CLOSE_MS = 350;

export function NewSheet({
  open,
  onClose,
  onFolder,
  onMedia,
  onFiles,
  onCamera,
}: {
  open: boolean;
  onClose: () => void;
  /** Absent where there is no folder to create one in (the drive-wide tabs). */
  onFolder?: () => void;
  onMedia: () => void;
  onFiles: () => void;
  onCamera: () => void;
}) {
  const { t } = useTranslation();
  // Close first, act once the sheet has slid away: started at once, the
  // camera's permission dialog opened over a sheet still on screen and the
  // sheet stayed behind it (QA_DEEP #20).
  const run = (fn: () => void) => () => {
    onClose();
    setTimeout(fn, SHEET_CLOSE_MS);
  };
  return (
    <BottomSheet open={open} onClose={onClose} testID="pages-new-sheet">
      {onFolder ? <SheetRow icon={FolderPlus} label={t("pages.new.folder")} onPress={run(onFolder)} testID="pages-new-folder" /> : null}
      <SheetRow icon={Images} label={t("pages.new.media")} onPress={run(onMedia)} testID="pages-new-media" />
      <SheetRow icon={File} label={t("pages.new.files")} onPress={run(onFiles)} testID="pages-new-files" />
      <SheetRow icon={Camera} label={t("pages.new.camera")} onPress={run(onCamera)} testID="pages-new-camera" />
    </BottomSheet>
  );
}

// ── "⋯" on one item ─────────────────────────────────────────────────────────

export function ActionsSheet({
  node,
  onClose,
  onShare,
  onStar,
  onRename,
  onMove,
  onDetails,
  onTrash,
  canWrite,
}: {
  node: PageNode | null;
  onClose: () => void;
  onShare: (node: PageNode) => void;
  onStar: (node: PageNode) => void;
  onRename: (node: PageNode) => void;
  onMove: (node: PageNode) => void;
  onDetails: (node: PageNode) => void;
  onTrash: (node: PageNode) => void;
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  if (!node) return null;
  const run = (fn: (n: PageNode) => void) => () => {
    onClose();
    fn(node);
  };
  return (
    <BottomSheet open onClose={onClose} testID="pages-actions-sheet">
      <SheetHeader node={node} />
      <ScrollView>
        {node.kind === "file" && node.attachmentUrl ? (
          <SheetRow icon={Download} label={t("pages.actions.share")} onPress={run(onShare)} testID="pages-action-share" />
        ) : null}
        {canWrite ? (
          <SheetRow
            icon={node.starred ? StarOff : Star}
            label={node.starred ? t("pages.actions.unstar") : t("pages.actions.star")}
            onPress={run(onStar)}
            testID="pages-action-star"
          />
        ) : null}
        {canWrite ? <SheetRow icon={Pencil} label={t("pages.actions.rename")} onPress={run(onRename)} testID="pages-action-rename" /> : null}
        {canWrite ? <SheetRow icon={FolderInput} label={t("pages.actions.move")} onPress={run(onMove)} testID="pages-action-move" /> : null}
        <SheetRow icon={Info} label={t("pages.actions.details")} onPress={run(onDetails)} testID="pages-action-details" />
        {canWrite ? <SheetRow icon={Trash2} label={t("pages.actions.trash")} danger onPress={run(onTrash)} testID="pages-action-trash" /> : null}
      </ScrollView>
    </BottomSheet>
  );
}

// ── Details ─────────────────────────────────────────────────────────────────

function familyLabel(family: FileFamily, t: (k: string) => string): string {
  switch (family) {
    case "folder":
      return t("pages.family.folder");
    case "page":
      return t("pages.family.page");
    case "pdf":
      return t("pages.family.pdf");
    case "doc":
      return t("pages.family.doc");
    case "sheet":
      return t("pages.family.sheet");
    case "slides":
      return t("pages.family.slides");
    case "image":
      return t("pages.family.image");
    case "video":
      return t("pages.family.video");
    case "audio":
      return t("pages.family.audio");
    case "archive":
      return t("pages.family.archive");
    default:
      return t("pages.family.other");
  }
}

/** "Nov 6, 2026, 3:45 PM" / "6 nov. 2026, 15:45": Drive's details, no seconds. */
const DATE_STYLE: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

export function DetailsSheet({ node, location, onClose }: { node: PageNode | null; location: string; onClose: () => void }) {
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  if (!node) return null;
  const rows: [string, string][] = [
    [t("pages.details.type"), familyLabel(familyOf(node), t) + (node.mimeType ? ` (${node.mimeType})` : "")],
    ...(node.kind === "file" ? ([[t("pages.details.size"), formatBytes(node.fileSize, t, i18n.language)]] as [string, string][]) : []),
    ...(node.kind === "folder" ? ([[t("pages.details.contains"), t("pages.itemCount", { count: node.childrenCount })]] as [string, string][]) : []),
    [t("pages.details.location"), location || node.space?.title || ""],
    [t("pages.details.owner"), node.ownerName ?? ""],
    [t("pages.details.modified"), `${new Date(node.updatedAt).toLocaleString(i18n.language, DATE_STYLE)} (${relativeTime(node.updatedAt)})`],
    ...(node.createdAt ? ([[t("pages.details.created"), new Date(node.createdAt).toLocaleString(i18n.language, DATE_STYLE)]] as [string, string][]) : []),
  ];
  return (
    <BottomSheet open onClose={onClose} testID="pages-details-sheet">
      <SheetHeader node={node} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: metrics.space.xl, gap: metrics.space.md, paddingVertical: metrics.space.sm }}>
        {rows.map(([label, value]) => (
          <View key={label}>
            <Text variant="caption" tone="muted">
              {label}
            </Text>
            <Text selectable>{value}</Text>
          </View>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

// ── Move: pick a space, then a folder; "Move here" ──────────────────────────

interface Place {
  space: { id: number; title: string };
  path: { id: number; title: string }[];
}

export function MoveSheet({
  nodes,
  onClose,
  onMove,
}: {
  nodes: PageNode[] | null;
  onClose: () => void;
  onMove: (to: { spaceId: number; parentId: number | null; label: string }) => Promise<void>;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const first = nodes?.[0];
  const [place, setPlace] = useState<Place | null>(null);
  const [busy, setBusy] = useState(false);
  const startedFor = useRef<number | null>(null);
  // Open where the item lives, like Drive's "Move": its folder, with the
  // path above it. A folder listing sends `space: null` (only drive-wide
  // lists send it), and no ancestors, so both are asked for: the space's
  // name, and the parent folder, whose `show` carries its ancestors.
  // Measured 2026-11-07: before this it opened on the list of spaces.
  useEffect(() => {
    if (!first) {
      startedFor.current = null;
      return;
    }
    if (startedFor.current === first.id) return;
    const id = first.id;
    startedFor.current = id;
    void (async () => {
      try {
        const space = first.space ?? (await pagesApi.space(first.spaceId));
        let path: Place["path"] = [];
        if (first.parentId != null) {
          const parent = await pagesApi.node(first.spaceId, first.parentId);
          path = [...parent.ancestors.map((a) => ({ id: a.id, title: a.title })), { id: parent.id, title: parent.title }];
        }
        // Only for the item still being moved (the sheet may have closed).
        if (startedFor.current === id) setPlace({ space: { id: space.id, title: space.title }, path });
      } catch {
        // The list of spaces is still a way to get anywhere.
        if (startedFor.current === id) setPlace(null);
      }
    })();
  }, [first]);
  const moving = useMemo(() => new Set((nodes ?? []).map((n) => n.id)), [nodes]);
  const parentId = place && place.path.length ? place.path[place.path.length - 1].id : null;

  const spaces = useQuery({ queryKey: ["pages", "spaces", "move"], queryFn: () => pagesApi.spaces(1), enabled: Boolean(nodes) && !place });
  const folders = useInfiniteQuery({
    queryKey: ["pages", "folders", "move", place?.space.id, parentId],
    queryFn: ({ pageParam }) => pagesApi.children(place!.space.id, parentId, pageParam, { kind: "folder", sortBy: "name", sortDir: "asc" }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled: Boolean(nodes) && Boolean(place),
  });
  // A folder cannot go into itself: it is not offered as a destination.
  const rows = (folders.data?.pages ?? []).flatMap((p) => p.rows).filter((f) => !moving.has(f.id));

  const confirm = useCallback(async () => {
    if (!place) return;
    setBusy(true);
    try {
      await onMove({ spaceId: place.space.id, parentId, label: [place.space.title, ...place.path.map((p) => p.title)].join(" / ") });
      onClose();
    } catch {
      Alert.alert(t("pages.actions.moveFailed"));
    } finally {
      setBusy(false);
    }
  }, [place, parentId, onMove, onClose, t]);

  if (!nodes) return null;
  const here = place ? (place.path.at(-1)?.title ?? place.space.title) : null;
  // Where they already are is not a move (Drive greys the button).
  const alreadyThere = place != null && nodes.every((n) => n.spaceId === place.space.id && n.parentId === parentId);
  return (
    <BottomSheet open onClose={onClose} testID="pages-move-sheet">
      <View style={{ paddingHorizontal: metrics.space.xl, gap: metrics.space.xs, paddingBottom: metrics.space.sm }}>
        <Text variant="label">{nodes.length === 1 ? t("pages.move.titleOne", { title: nodes[0].title }) : t("pages.move.titleMany", { count: nodes.length })}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
            <Pressable onPress={() => setPlace(null)} accessibilityRole="button" accessibilityLabel={t("pages.save.allSpaces")} hitSlop={8} testID="pages-move-crumb-root">
              <Text tone={place ? "accent" : "default"}>{t("pages.save.allSpaces")}</Text>
            </Pressable>
            {place ? (
              <>
                <ChevronRight size={14} color={colors.inkMuted} />
                <Pressable onPress={() => setPlace({ ...place, path: [] })} accessibilityRole="button" accessibilityLabel={place.space.title} hitSlop={8}>
                  <Text tone={place.path.length ? "accent" : "default"}>{place.space.title}</Text>
                </Pressable>
              </>
            ) : null}
            {place?.path.map((crumb, i) => (
              <View key={crumb.id} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
                <ChevronRight size={14} color={colors.inkMuted} />
                <Pressable onPress={() => setPlace({ ...place, path: place.path.slice(0, i + 1) })} accessibilityRole="button" accessibilityLabel={crumb.title} hitSlop={8}>
                  <Text tone={i === place.path.length - 1 ? "default" : "accent"}>{crumb.title}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      <FlatList
        style={{ maxHeight: 320 }}
        data={(place ? rows : (spaces.data?.rows ?? [])).map((x) => ({ id: x.id, title: x.title, icon: "icon" in x ? x.icon : null }))}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={
          (place ? folders.isLoading : spaces.isLoading) ? (
            <ActivityIndicator color={colors.inkMuted} style={{ padding: metrics.space.lg }} />
          ) : (
            <Text tone="muted" style={{ paddingHorizontal: metrics.space.xl, paddingVertical: metrics.space.md }}>
              {t("pages.move.noFolders")}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              place
                ? setPlace({ ...place, path: [...place.path, { id: item.id, title: item.title }] })
                : setPlace({ space: { id: item.id, title: item.title }, path: [] })
            }
            accessibilityRole="button"
            accessibilityLabel={item.title}
            style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.lg, minHeight: 52, paddingHorizontal: metrics.space.xl }}
            testID={place ? "pages-move-folder" : "pages-move-space"}
          >
            {place ? <Folder size={22} color={colors.inkMuted} fill={colors.inkMuted} /> : <Text style={{ fontSize: 20 }}>{item.icon ?? "📁"}</Text>}
            <Text style={{ flex: 1 }} numberOfLines={1}>
              {item.title}
            </Text>
            <ChevronRight size={18} color={colors.inkMuted} />
          </Pressable>
        )}
      />
      <View style={{ paddingHorizontal: metrics.space.xl, paddingTop: metrics.space.md }}>
        <Button label={here ? t("pages.move.here", { place: here }) : t("pages.save.pickPlace")} disabled={!place || alreadyThere} busy={busy} onPress={() => void confirm()} testID="pages-move-here" />
      </View>
    </BottomSheet>
  );
}
