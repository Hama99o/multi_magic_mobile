/**
 * THE PIECES EVERY DOC TOOL SHARES (docs/design/doc/SPEC.md §B, §C.2, §C.11).
 *
 * - `IntakeCard` + `IntakeSheet`: one way in for every tool. The sheet shows
 *   only the rows a tool can use (Pages and Text take a PDF, so no Photos or
 *   Camera), and the card says the limits BEFORE anything is sent.
 * - `useDocTask` + `BusyCard`: a slow call shows what it is doing (sending
 *   n %, then working) and can be cancelled; the cancel aborts the request.
 * - `ResultSheet`: what a tool made, with Share and Save.
 * - `reasonText`: every refusal in plain words, the file named when known.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Image as ExpoImage } from "expo-image";
import { DocError, type CallOptions, type DocFile, type DocResult, type Progress } from "@/api/doc";
import { Camera, File as FileIcon, FileImage, FileText, Images, Plus, ScanLine, X, type LucideIcon } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { APP_COLORS } from "@/theme/appColors";
import { explainPick, friendlyName, type PickResult } from "@/screens/pages/addFiles";
import { formatBytes } from "@/screens/pages/parts";
import { BottomSheet, SheetRow, SHEET_CLOSE_MS } from "@/screens/pages/drive/sheets";
import { checkOne, kindOf, normalise, type Refusal } from "./files";
import { DOC_SCANNER_ENABLED, pickFiles, pickPhotos, saveResults, shareResult, takePhoto } from "./io";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/* ───────────────────────────── words ────────────────────────────────────── */

const REASON_KEYS: Partial<Record<string, string>> = {
  no_file: "doc.errors.no_file",
  too_large: "doc.errors.too_large",
  too_many_files: "doc.errors.too_many_files",
  locked: "doc.errors.locked",
  damaged: "doc.errors.damaged",
  empty: "doc.errors.empty",
  unreadable_image: "doc.errors.unreadable_image",
  no_signature: "doc.errors.no_signature",
  invalid: "doc.errors.invalid",
  rate_limited: "doc.errors.rate_limited",
  unsupported_format: "doc.errors.unsupported_format",
  offline: "doc.errors.offline",
};

/** A refusal or a failure, in plain words; the file named when we know it. */
export function reasonText(t: Translate, problem: DocError | Refusal, name?: string): string {
  const reason = problem.reason;
  const who = name ?? ("name" in problem ? problem.name : undefined);
  if (reason === "not_pdf") return who ? t("doc.errors.not_pdf", { name: who }) : t("doc.errors.not_pdf_plain");
  const key = REASON_KEYS[reason] ?? "doc.errors.unknown";
  const base = t(key);
  return who && (reason === "locked" || reason === "damaged" || reason === "empty" || reason === "too_large" || reason === "unreadable_image" || reason === "unsupported_format")
    ? t("doc.errors.named", { name: who, reason: base })
    : base;
}

/* ───────────────────────────── intake ───────────────────────────────────── */

export type Accept = "pdf" | "image" | "any";

export function IntakeSheet({
  open,
  onClose,
  accept,
  multiple,
  onPicked,
}: {
  open: boolean;
  onClose: () => void;
  accept: Accept;
  multiple: boolean;
  onPicked: (result: PickResult) => void;
}) {
  const { t } = useTranslation();
  // Close first, act once the sheet has slid away (Pages' QA_DEEP #20).
  const run = (pick: () => Promise<PickResult>) => () => {
    onClose();
    setTimeout(() => void pick().then(onPicked), SHEET_CLOSE_MS);
  };
  return (
    <BottomSheet open={open} onClose={onClose} testID="doc-intake-sheet">
      <Text variant="label" tone="muted" accessibilityRole="header" style={{ paddingHorizontal: 24, paddingBottom: 8 }}>
        {t("doc.intake.sheetTitle")}
      </Text>
      {DOC_SCANNER_ENABLED ? <SheetRow icon={ScanLine} label={t("doc.intake.scan")} onPress={onClose} testID="doc-intake-scan" /> : null}
      {accept !== "pdf" ? <SheetRow icon={Images} label={t("doc.intake.photos")} onPress={run(() => pickPhotos(multiple))} testID="doc-intake-photos" /> : null}
      {accept !== "image" ? <SheetRow icon={FileIcon} label={t("doc.intake.files")} onPress={run(() => pickFiles(multiple, accept === "pdf"))} testID="doc-intake-files" /> : null}
      {accept !== "pdf" ? <SheetRow icon={Camera} label={t("doc.intake.camera")} onPress={run(takePhoto)} testID="doc-intake-camera" /> : null}
    </BottomSheet>
  );
}

/**
 * Picked files, checked before any upload. The ones a tool cannot take are
 * SAID, by name, and the rest go on (the web's merge does the same).
 */
export function useIntake(accept: Accept, multiple: boolean, onFiles: (files: DocFile[]) => void) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const onPicked = useCallback(
    (result: PickResult) => {
      const files = explainPick(result, t);
      if (!files) return;
      const ok: DocFile[] = [];
      const refused: string[] = [];
      for (const raw of files) {
        const file = normalise({ uri: raw.uri, name: raw.name ?? friendlyName(null, raw.mimeType ?? null, null), mimeType: raw.mimeType ?? null, size: raw.size ?? null });
        const problem = checkOne(file, accept);
        if (problem) refused.push(reasonText(t, problem));
        else ok.push(file);
      }
      if (refused.length) Alert.alert(t("doc.title"), refused.join("\n"));
      if (ok.length) onFiles(multiple ? ok : ok.slice(0, 1));
    },
    [accept, multiple, onFiles, t],
  );
  const sheet = <IntakeSheet open={open} onClose={() => setOpen(false)} accept={accept} multiple={multiple} onPicked={onPicked} />;
  return { openSheet: () => setOpen(true), sheet };
}

/** A tool's empty state: what it does, what it takes, one button. */
export function IntakeCard({ icon: Icon, help, limits, onAdd, testID }: { icon: LucideIcon; help: string; limits: string; onAdd: () => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <View
      testID={testID}
      style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, borderRadius: metrics.radius.lg, padding: metrics.space.xl, gap: metrics.space.md, alignItems: "center" }}
    >
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: APP_COLORS.doc, alignItems: "center", justifyContent: "center" }}>
        <Icon size={26} color="#04161a" />
      </View>
      <Text style={{ textAlign: "center" }}>{help}</Text>
      <Text variant="caption" tone="muted" style={{ textAlign: "center" }}>
        {limits}
      </Text>
      <View style={{ alignSelf: "stretch" }}>
        <Button label={t("doc.intake.add")} onPress={onAdd} testID={`${testID}-add`} />
      </View>
    </View>
  );
}

/** One file, with its size, an optional note, and a way to take it away. */
export function FileRow({ file, note, onClear, right }: { file: DocFile; note?: string | null; onClear?: () => void; right?: ReactNode }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const kind = kindOf(file);
  return (
    <View
      testID="doc-file-row"
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, padding: metrics.space.md, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      {kind === "image" && !thumbFailed ? (
        // A picture the phone cannot decode (a 10-bit HEIC, a TIFF) gets the icon instead of a grey square.
        <ExpoImage source={{ uri: file.uri }} style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: colors.border }} contentFit="cover" accessible={false} onError={() => setThumbFailed(true)} />
      ) : kind === "image" ? (
        <FileImage size={28} color={colors.inkMuted} />
      ) : (
        <FileText size={28} color={colors.inkMuted} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="label" numberOfLines={1}>
          {file.name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {[formatBytes(file.size, t, i18n.language), note].filter(Boolean).join(" · ")}
        </Text>
      </View>
      {right}
      {onClear ? (
        <Pressable
          testID="doc-file-clear"
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={t("doc.file.remove", { name: file.name })}
          style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
        >
          <X size={20} color={colors.inkMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** "Add more" as a row, for the tools that take several files. */
export function AddMoreRow({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <Pressable
      testID="doc-add-more"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("doc.intake.addMore")}
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: metrics.space.sm, minHeight: metrics.touch, borderRadius: metrics.radius.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border }}
    >
      <Plus size={18} color={colors.ink} />
      <Text variant="label">{t("doc.intake.addMore")}</Text>
    </Pressable>
  );
}

/* ───────────────────────────── slow calls ───────────────────────────────── */

export interface TaskState {
  busy: boolean;
  progress: Progress | null;
  /** "3 of 8" when one action is several calls (split, PDF → pictures). */
  step: { n: number; total: number } | null;
  error: DocError | null;
}

/**
 * Runs one tool call with a cancel. A newer `run` cancels the older one (the
 * compress preview re-runs on every change), and leaving the screen cancels
 * whatever is in flight. A cancel is not an error: it says nothing.
 */
export function useDocTask() {
  const [state, setState] = useState<TaskState>({ busy: false, progress: null, step: null, error: null });
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const run = useCallback(async <T,>(work: (opts: CallOptions & { step: (n: number, total: number) => void }) => Promise<T>): Promise<T | null> => {
    controller.current?.abort();
    const mine = new AbortController();
    controller.current = mine;
    setState({ busy: true, progress: null, step: null, error: null });
    try {
      const value = await work({
        signal: mine.signal,
        onProgress: (progress) => mounted.current && controller.current === mine && setState((s) => ({ ...s, progress })),
        step: (n, total) => mounted.current && controller.current === mine && setState((s) => ({ ...s, step: { n, total }, progress: null })),
      });
      if (mounted.current && controller.current === mine) setState({ busy: false, progress: null, step: null, error: null });
      return mine.signal.aborted ? null : value;
    } catch (error) {
      const err = error instanceof DocError ? error : new DocError("unknown");
      if (mounted.current && controller.current === mine) setState({ busy: false, progress: null, step: null, error: err.reason === "cancelled" ? null : err });
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState({ busy: false, progress: null, step: null, error: null });
  }, []);

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  return { ...state, run, cancel, clearError };
}

/** What a slow call is doing, and the way out of it. */
export function BusyCard({ task, label }: { task: TaskState & { cancel: () => void }; label?: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  if (!task.busy) return null;
  const sent = task.progress?.sent;
  const uploading = sent != null && sent < 1;
  const line = uploading ? t("doc.busy.uploading", { percent: Math.round(sent * 100) }) : (label ?? t("doc.busy.working"));
  return (
    <View
      testID="doc-busy"
      accessibilityLiveRegion="polite"
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, padding: metrics.space.md, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      <ActivityIndicator color={colors.accent} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="label">{line}</Text>
        {task.step ? (
          <Text variant="caption" tone="muted">
            {t("doc.busy.step", task.step)}
          </Text>
        ) : null}
        {uploading ? (
          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden" }}>
            <View style={{ width: `${Math.round((sent ?? 0) * 100)}%`, height: 4, backgroundColor: colors.accent }} />
          </View>
        ) : null}
      </View>
      <Pressable testID="doc-busy-cancel" onPress={task.cancel} accessibilityRole="button" accessibilityLabel={t("doc.busy.cancel")} style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.sm }}>
        <Text variant="label" tone="accent">
          {t("doc.busy.cancel")}
        </Text>
      </Pressable>
    </View>
  );
}

/** A failure, said in place (not a toast that vanishes before it is read). */
export function ErrorLine({ error, name, onDismiss }: { error: DocError | null; name?: string; onDismiss?: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  if (!error) return null;
  // Our own words for every known reason (both languages); the server's
  // sentence only where it is the sole explanation (`invalid`, an unknown).
  const text = (error.reason === "invalid" || error.reason === "unknown") && error.serverMessage ? error.serverMessage : reasonText(t, error, name);
  return (
    <View testID="doc-error" accessibilityLiveRegion="assertive" style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, padding: metrics.space.md, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.danger }}>
      <Text tone="danger" style={{ flex: 1 }}>
        {text}
      </Text>
      {onDismiss ? (
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel={t("common.close")} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
          <X size={18} color={colors.inkMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ───────────────────────────── results ──────────────────────────────────── */

export function ResultSheet({ results, onClose, extra }: { results: DocResult[] | null; onClose: () => void; extra?: ReactNode }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [saving, setSaving] = useState<{ n: number; total: number } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => setSaid(null), [results]);
  if (!results || results.length === 0) return null;
  const one = results.length === 1 ? results[0] : null;

  const save = async (toFiles = false) => {
    setSaid(null);
    try {
      const outcome = await saveResults(results, undefined, { toFiles }, (n, total) => setSaving({ n, total }));
      setSaving(null);
      if (outcome === null) return;
      if (outcome === "gallery-denied") {
        Alert.alert(t("doc.result.save"), t("doc.result.galleryDenied"), [
          { text: t("doc.signatures.cancel"), style: "cancel" },
          { text: t("doc.result.toFolder"), onPress: () => void save(true) },
        ]);
        return;
      }
      const parts = [
        outcome.destination === "gallery" ? t("doc.result.savedGallery", { count: outcome.saved }) : t("doc.result.savedFiles", { count: outcome.saved }),
        outcome.failed ? t("doc.result.someFailed", { count: outcome.failed }) : null,
      ];
      setSaid(parts.filter(Boolean).join(" "));
    } catch {
      setSaving(null);
      setSaid(t("doc.errors.unknown"));
    }
  };

  const share = async () => {
    if (!one) return;
    try {
      if ((await shareResult(one)) === "unavailable") setSaid(t("doc.result.noShare"));
    } catch {
      setSaid(t("doc.errors.unknown"));
    }
  };

  return (
    <BottomSheet open onClose={onClose} testID="doc-result-sheet">
      <View style={{ paddingHorizontal: metrics.space.xl, gap: metrics.space.md, paddingBottom: metrics.space.sm }}>
        <Text variant="title" accessibilityRole="header">
          {one ? t("doc.result.ready") : t("doc.result.readyMany", { count: results.length })}
        </Text>
        {one && one.mimeType.startsWith("image/") ? (
          <ExpoImage source={{ uri: one.uri }} style={{ width: "100%", height: 180, borderRadius: metrics.radius.md, backgroundColor: colors.surface }} contentFit="contain" accessible={false} />
        ) : null}
        {results.slice(0, 4).map((r) => (
          <View key={r.uri} style={{ flexDirection: "row", gap: metrics.space.sm, alignItems: "center" }}>
            <FileText size={18} color={colors.inkMuted} />
            <Text numberOfLines={1} style={{ flex: 1 }} testID="doc-result-name">
              {r.name}
            </Text>
            <Text variant="caption" tone="muted">
              {formatBytes(r.size, t, i18n.language)}
            </Text>
          </View>
        ))}
        {results.length > 4 ? (
          <Text variant="caption" tone="muted">
            …
          </Text>
        ) : null}
        {extra}
        {saving ? (
          <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
            {t("doc.result.saving", saving)}
          </Text>
        ) : null}
        {said ? (
          <Text accessibilityLiveRegion="polite" testID="doc-result-said">
            {said}
          </Text>
        ) : null}
        {one ? <Button label={t("doc.result.share")} onPress={() => void share()} testID="doc-result-share" /> : null}
        <Button tone="neutral" label={one ? t("doc.result.save") : t("doc.result.saveAll")} busy={saving !== null} onPress={() => void save()} testID="doc-result-save" />
        <Button tone="neutral" label={t("doc.result.done")} onPress={onClose} testID="doc-result-done" />
      </View>
    </BottomSheet>
  );
}
