/**
 * EDIT THE WORDS OF A PDF (SPEC §C.8; web `TextEditorDoc.tsx`, server
 * `pdf/text`, `pdf/page`, `pdf/edit`).
 *
 * The page picture and the text boxes both come from the server, so they
 * agree. A box over every line: blue can be edited, amber dotted cannot be
 * read, grey dashed is a picture of text, faint blue is a scan's invisible
 * layer; tapping a mark that cannot be edited says why.
 *
 * Phone-hard, and what this does about it (parity audit §5):
 * - Lines are 6–12 pt at 360 dp, far below a 48 dp target. So the page
 *   zooms (75–300 %), AND every editable line is also a row in "Lines on
 *   this page" under it: the way in for a thumb and for a screen reader.
 * - Typing over the page would put the keyboard on top of it. Tapping a line
 *   opens a sheet with the text and the toolbar; the page above shows the
 *   change live (old words covered in white, new ones in their style — the
 *   web samples the paper's colour, G8, not built; white is its fallback).
 * - A turned page is read-only, as on the web.
 */
import { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { docKeys } from "@/api/keys";
import { docApi, type DocError, type DocFile, type DocResult } from "@/api/doc";
import { Bold, ChevronLeft, ChevronRight, Italic, Type, ZoomIn, ZoomOut, type LucideIcon } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { KeyboardPadding } from "@/components/KeyboardPadding";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/reusables/button";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { familyFor } from "@/theme/fonts";
import { FILL } from "@/theme/fill";
import { BusyCard, ErrorLine, FileRow, IntakeCard, ResultSheet, useDocTask, useIntake, useRetry, useKeepUnsaved } from "@/screens/doc/ui";
import { PdfPage, inspectionProblem, useInspect } from "@/screens/doc/pdf";
import { Chip, SectionLabel, Stepper, Swatches } from "@/screens/doc/controls";
import {
  HIGHLIGHTS,
  SIZE_MAX,
  SIZE_MIN,
  TEXT_COLORS,
  boxOn,
  buildEdits,
  isChanged,
  isEditable,
  isRestyled,
  keyOf,
  loadWarning,
  missingGlyphs,
  parseTextDocument,
  repaints,
  summarise,
  textOf,
  type Draft,
  type Drafts,
  type Family,
  type PageGeometry,
  type TextRun,
} from "@/screens/doc/textRuns";

const ZOOM_MIN = 0.75;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

/** Marks on the page picture, which is paper in both themes: fixed colours. */
const MARK = {
  editable: { borderWidth: 1, borderColor: "rgba(37, 99, 235, 0.55)", backgroundColor: "rgba(37, 99, 235, 0.06)" },
  changed: { borderWidth: 1.5, borderColor: "rgba(22, 163, 74, 0.9)" },
  unreadable: { borderWidth: 1, borderStyle: "dotted" as const, borderColor: "rgba(180, 83, 9, 0.75)", backgroundColor: "rgba(217, 119, 6, 0.14)" },
  picture: { borderWidth: 1, borderStyle: "dashed" as const, borderColor: "rgba(100, 116, 139, 0.65)", backgroundColor: "rgba(100, 116, 139, 0.10)" },
  invisible: { borderWidth: 1, borderStyle: "dashed" as const, borderColor: "rgba(37, 99, 235, 0.45)", backgroundColor: "rgba(37, 99, 235, 0.06)" },
};

type Why = "whyInvisible" | "whyUnreadable" | "whyPicture";
const WHY_KEYS: Record<Why, string> = { whyInvisible: "doc.text.whyInvisible", whyUnreadable: "doc.text.whyUnreadable", whyPicture: "doc.text.whyPicture" };
const WARNING_KEYS = { tooMuchText: "doc.text.tooMuchText", onlyInvisible: "doc.text.onlyInvisible", onlyUnreadable: "doc.text.onlyUnreadable", noText: "doc.text.noText" } as const;

export default function TextEditorScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const [file, setFile] = useState<DocFile | null>(null);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [why, setWhy] = useState<Why | null>(null);
  const [results, setResults] = useState<DocResult[] | null>(null);
  const [said, setSaid] = useState<string[]>([]);
  const task = useDocTask();
  const { remember, retry } = useRetry();

  const intake = useIntake("pdf", false, (files) => {
    setFile(files[0]);
    setPage(0);
    setDrafts({});
    setEditing(null);
    task.clearError();
  });
  const inspect = useInspect(file);
  const usable = file && inspect.data && !inspectionProblem(inspect.data) ? file : null;
  const text = useQuery<ReturnType<typeof parseTextDocument>, DocError>({
    queryKey: docKeys.text(usable?.uri ?? ""),
    queryFn: async ({ signal }) => parseTextDocument(await docApi.pdfText(usable as DocFile, undefined, { signal })),
    enabled: Boolean(usable),
    staleTime: Infinity,
    retry: false,
  });
  const problem = inspectionProblem(inspect.data) ?? inspect.error ?? text.error ?? null;
  const doc = text.data;

  const byKey = useMemo(() => new Map((doc?.runs ?? []).map((r) => [keyOf(r), r])), [doc]);
  const geometry: PageGeometry | undefined = doc?.pages[page];
  const pageRuns = useMemo(() => (doc?.runs ?? []).filter((r) => r.page === page), [doc, page]);
  const editable = pageRuns.filter(isEditable);
  const invisible = pageRuns.filter((r) => r.readable && !r.visible);
  const unreadable = pageRuns.filter((r) => !r.readable);
  const outlines = (doc?.outlines ?? []).filter((o) => o.page === page);
  const rotated = Boolean(geometry && geometry.rotation % 360 !== 0);
  const edits = useMemo(() => buildEdits(drafts, byKey), [drafts, byKey]);
  // Work in progress asks before Change or Back drops it (review 88, D3).
  const { guard } = useKeepUnsaved(edits.length > 0);
  const warning = doc ? loadWarning(doc) : null;
  const pageCount = doc?.pages.length ?? 0;

  const contentWidth = Math.min(windowWidth, metrics.maxMeasure) - metrics.space.lg * 2;
  const shownWidth = Math.max(200, contentWidth * zoom);
  // `pdf/text` gives a page's geometry UNturned, while poppler draws it turned
  // (measured: a /Rotate 90 page is 595×842 there, 842×595 in inspect). A
  // turned page is read-only, so its picture takes inspect's shape, unmarked.
  const shown = inspect.data?.sizes[page];
  const aspect = rotated && shown ? shown.height / shown.width : geometry ? geometry.height / geometry.width : 1.414;
  const scale = geometry ? shownWidth / geometry.width : 1;

  const start = (run: TextRun) => {
    const key = keyOf(run);
    setDrafts((d) => (d[key] ? d : { ...d, [key]: { text: textOf(run) } }));
    setEditing(key);
  };
  const update = (key: string, change: Partial<Draft>) => setDrafts((d) => (d[key] ? { ...d, [key]: { ...d[key], ...change } } : d));

  const discard = () =>
    Alert.alert(t("doc.text.discardTitle"), t("doc.text.discardBody"), [
      { text: t("doc.signatures.cancel"), style: "cancel" },
      { text: t("doc.text.discard"), style: "destructive", onPress: () => setDrafts({}) },
    ]);

  const save = remember("save", async () => {
    if (!file || edits.length === 0) return;
    const out = await task.run((opts) => docApi.pdfEdit(file, edits, opts));
    if (!out) return;
    const s = summarise(out.report, edits.length);
    setSaid(
      [
        s.substituted.count ? t("doc.text.savedWithSubstitute", { count: s.substituted.count, characters: s.substituted.characters }) : t("doc.text.saved", { count: s.applied }),
        s.rejected ? t("doc.text.someRejected", { count: s.rejected }) : null,
        s.sharedWith ? t("doc.text.savedShared", { count: s.sharedWith }) : null,
      ].filter((x): x is string => Boolean(x)),
    );
    setResults([out.result]);
  });

  const editingRun = editing ? byKey.get(editing) : undefined;

  return (
    <Screen measure header={<AppHeader app="doc" title={t("doc.tools.text.title")} back />}>
      <ScrollView contentContainerStyle={{ gap: metrics.space.md, paddingVertical: metrics.space.md }}>
        {!file ? (
          <IntakeCard testID="doc-text-intake" icon={Type} help={t("doc.text.help")} limits={`${t("doc.intake.pdfOnly")} ${t("doc.text.pdfNote")}`} onAdd={intake.openSheet} />
        ) : (
          <>
            <FileRow
              file={file}
              note={doc ? t("doc.file.pages", { count: pageCount }) : null}
              right={
                <Pressable onPress={guard(intake.openSheet)} accessibilityRole="button" accessibilityLabel={t("doc.intake.change")} style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.sm }} testID="doc-text-change">
                  <Text variant="label" tone="accent">
                    {t("doc.intake.change")}
                  </Text>
                </Pressable>
              }
            />
            <ErrorLine error={problem} name={file.name} onRetry={() => { if (inspect.error) void inspect.refetch(); if (text.error) void text.refetch(); }} />
            {!problem && !doc ? <BusyCard task={{ busy: true, progress: null, step: null, error: null, cancel: () => setFile(null) }} label={t("doc.text.reading")} /> : null}
            {doc && geometry ? (
              <>
                {warning ? (
                  <Text tone="muted" testID="doc-text-warning">
                    {t(WARNING_KEYS[warning])}
                  </Text>
                ) : null}
                {rotated ? (
                  <Text tone="danger" testID="doc-text-rotated">
                    {t("doc.text.rotatedPage")}
                  </Text>
                ) : null}

                <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
                  <IconButton icon={ZoomOut} label={t("doc.text.zoomOut")} disabled={zoom <= ZOOM_MIN} onPress={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))} testID="doc-text-zoom-out" />
                  <Text variant="label" style={{ minWidth: 56, textAlign: "center" }}>
                    {t("doc.text.zoomValue", { percent: Math.round(zoom * 100) })}
                  </Text>
                  <IconButton icon={ZoomIn} label={t("doc.text.zoomIn")} disabled={zoom >= ZOOM_MAX} onPress={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))} testID="doc-text-zoom-in" />
                  <View style={{ flex: 1 }} />
                  <Text variant="label" tone={edits.length ? "accent" : "muted"} testID="doc-text-changes">
                    {t("doc.text.changes", { count: edits.length })}
                  </Text>
                </View>

                <ScrollView horizontal scrollEnabled={zoom > 1} showsHorizontalScrollIndicator={zoom > 1} contentContainerStyle={{ minWidth: contentWidth, justifyContent: "center" }}>
                  <PdfPage file={file} page={page} width={shownWidth} aspect={aspect} testID="doc-text-page">
                    {rotated ? null : outlines.map((o, i) => (
                      <Mark key={`o${i}`} box={boxOn(geometry, o)} size={{ width: shownWidth, height: shownWidth * aspect }} style={MARK.picture} label={t("doc.text.why")} onPress={() => setWhy("whyPicture")} />
                    ))}
                    {rotated ? null : unreadable.map((r) => (
                      <Mark key={keyOf(r)} box={boxOn(geometry, r)} size={{ width: shownWidth, height: shownWidth * aspect }} style={MARK.unreadable} label={t("doc.text.why")} onPress={() => setWhy("whyUnreadable")} />
                    ))}
                    {rotated ? null : invisible.map((r) => (
                      <Mark key={keyOf(r)} box={boxOn(geometry, r)} size={{ width: shownWidth, height: shownWidth * aspect }} style={MARK.invisible} label={t("doc.text.why")} onPress={() => setWhy("whyInvisible")} />
                    ))}
                    {(rotated ? [] : editable).map((r) => {
                      const draft = drafts[keyOf(r)];
                      const changed = isChanged(r, draft);
                      return (
                        <Mark
                          key={keyOf(r)}
                          box={boxOn(geometry, r)}
                          size={{ width: shownWidth, height: shownWidth * aspect }}
                          style={changed ? MARK.changed : MARK.editable}
                          label={t("doc.text.editRun", { text: textOf(r) })}
                          disabled={rotated}
                          onPress={() => start(r)}
                        >
                          {changed && draft ? <Preview run={r} draft={draft} scale={scale} pageWidth={shownWidth} /> : null}
                        </Mark>
                      );
                    })}
                  </PdfPage>
                </ScrollView>

                {pageCount > 1 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: metrics.space.md }}>
                    <IconButton icon={ChevronLeft} label={t("doc.text.previous")} disabled={page === 0} onPress={() => setPage((p) => p - 1)} testID="doc-text-prev" />
                    <Text variant="label">{t("doc.text.pageOf", { n: page + 1, total: pageCount })}</Text>
                    <IconButton icon={ChevronRight} label={t("doc.text.next")} disabled={page >= pageCount - 1} onPress={() => setPage((p) => p + 1)} testID="doc-text-next" />
                  </View>
                ) : null}

                <View testID="doc-text-legend" style={{ gap: 2, display: rotated ? "none" : "flex" }}>
                  <Text variant="caption" tone="muted">
                    {t("doc.text.legendEditable", { count: editable.length })}
                  </Text>
                  {unreadable.length ? (
                    <Text variant="caption" tone="muted">
                      {t("doc.text.legendUnreadable", { count: unreadable.length })}
                    </Text>
                  ) : null}
                  {outlines.length ? (
                    <Text variant="caption" tone="muted">
                      {t("doc.text.legendPicture", { count: outlines.length })}
                    </Text>
                  ) : null}
                  {invisible.length ? (
                    <Text variant="caption" tone="muted">
                      {t("doc.text.legendInvisible", { count: invisible.length })}
                    </Text>
                  ) : null}
                </View>

                {edits.length ? (
                  <Text variant="caption" tone="muted">
                    {t("doc.text.previewNote")}
                  </Text>
                ) : null}
                <BusyCard task={task} />
                <ErrorLine error={task.error} name={file.name} onDismiss={task.clearError} onRetry={() => retry({ save })} />
                <Button testID="doc-text-save" label={t("doc.text.save")} disabled={edits.length === 0 || task.busy} onPress={() => void save()} />
                {edits.length ? <Button testID="doc-text-discard" tone="neutral" label={t("doc.text.discard")} onPress={discard} /> : null}

                {!rotated && editable.length ? (
                  <View style={{ gap: metrics.space.xs }} testID="doc-text-lines">
                    <SectionLabel>{t("doc.text.lines")}</SectionLabel>
                    {editable.map((r) => {
                      const draft = drafts[keyOf(r)];
                      const changed = isChanged(r, draft);
                      return (
                        <Pressable
                          key={keyOf(r)}
                          testID="doc-text-line"
                          onPress={() => start(r)}
                          accessibilityRole="button"
                          accessibilityLabel={t("doc.text.editRun", { text: draft?.text ?? textOf(r) })}
                          style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.sm, borderWidth: 1, borderColor: changed ? colors.accent : colors.border, backgroundColor: colors.surface }}
                        >
                          <Text numberOfLines={2}>{draft?.text ?? textOf(r)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      {intake.sheet}
      {editingRun && editing && drafts[editing] ? <EditSheet run={editingRun} draft={drafts[editing]} onChange={(c) => update(editing, c)} onClose={() => setEditing(null)} /> : null}
      {why ? <WhySheet text={t(WHY_KEYS[why])} onClose={() => setWhy(null)} /> : null}
      <ResultSheet
        results={results}
        onClose={() => setResults(null)}
        extra={said.map((s) => (
          <Text key={s} testID="doc-text-report">
            {s}
          </Text>
        ))}
      />
    </Screen>
  );
}

function Mark({
  box,
  size,
  style,
  label,
  onPress,
  disabled,
  children,
}: {
  box: { left: number; top: number; width: number; height: number };
  size: { width: number; height: number };
  style: object;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      // A 6 pt line is a sliver: the touch reaches past it (the list below is the real target).
      hitSlop={6}
      style={{ position: "absolute", left: box.left * size.width, top: box.top * size.height, width: box.width * size.width, height: box.height * size.height, overflow: "visible", ...style }}
    >
      {children}
    </Pressable>
  );
}

/** The change, drawn on the page: old words covered, new ones in their style. */
function Preview({ run, draft, scale, pageWidth }: { run: TextRun; draft: Draft; scale: number; pageWidth: number }) {
  const size = Math.max(6, (draft.size ?? run.size) * scale);
  const family = draft.family === "serif" ? familyFor("serif") : draft.family === "mono" ? familyFor("mono") : undefined;
  return (
    <>
      {/* The old words covered (or highlighted) inside their own box. */}
      <View pointerEvents="none" style={{ ...FILL, backgroundColor: draft.highlight ?? (repaints(run, draft) ? "#ffffff" : "transparent") }} />
      {repaints(run, draft) ? (
        // The new words may be wider than the old box (bold, a longer amount):
        // they overflow it, as the rewrite will, rather than being cut — measured
        // on qa_phone3, "Total due: 1340 EUR" in bold lost its "EUR".
        <Text
          numberOfLines={1}
          style={{ position: "absolute", left: 0, bottom: 0, width: pageWidth, backgroundColor: "transparent", fontSize: size, lineHeight: size * 1.15, color: draft.color ?? run.color, fontWeight: draft.bold ? "700" : "400", fontStyle: draft.italic ? "italic" : "normal", fontFamily: family, includeFontPadding: false }}
        >
          {draft.text}
        </Text>
      ) : null}
    </>
  );
}

function IconButton({ icon: Icon, label, onPress, disabled, testID }: { icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={{ width: metrics.touch, height: metrics.touch, borderRadius: metrics.touch / 2, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}
    >
      <Icon size={20} color={colors.ink} />
    </Pressable>
  );
}

/** A sheet that rises with the keyboard (edge-to-edge Android is not resized for it). */
function KeyboardSheet({ onClose, children, testID }: { onClose: () => void; children: React.ReactNode; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* KeyboardPadding, not KeyboardAvoidingView "height" (the shape the
          kav-height lint rule refuses): on edge-to-edge Android "height" left
          controls under the keyboard (measured in Pages, 2026-11-21). */}
      <KeyboardPadding>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.35)" }} />
          <View testID={testID} style={{ backgroundColor: colors.ground, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: metrics.space.lg, paddingBottom: metrics.space.lg + insets.bottom, width: "100%", maxWidth: metrics.maxMeasure, alignSelf: "center", maxHeight: "80%" }}>
            {children}
          </View>
        </View>
      </KeyboardPadding>
    </Modal>
  );
}

function WhySheet({ text, onClose }: { text: string; onClose: () => void }) {
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <KeyboardSheet onClose={onClose} testID="doc-text-why">
      <View style={{ gap: metrics.space.md }}>
        <Text variant="label" accessibilityRole="header">
          {t("doc.text.why")}
        </Text>
        <Text>{text}</Text>
        <Button label={t("doc.text.done")} onPress={onClose} />
      </View>
    </KeyboardSheet>
  );
}

const FAMILIES: { key: Family; label: string }[] = [
  { key: "original", label: "doc.text.fontOriginal" },
  { key: "sans", label: "doc.text.fontSans" },
  { key: "serif", label: "doc.text.fontSerif" },
  { key: "mono", label: "doc.text.fontMono" },
];

export function EditSheet({ run, draft, onChange, onClose }: { run: TextRun; draft: Draft; onChange: (c: Partial<Draft>) => void; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const missing = missingGlyphs(run, draft);
  const size = Math.round(draft.size ?? run.size);
  return (
    <KeyboardSheet onClose={onClose} testID="doc-text-sheet">
      {/* The fields scroll; Clear and Done do not. With the keyboard up the sheet
          ends at the keyboard and the colour rows fill it, so Done at the end of
          the scroll was out of sight (device, flow 48, 2026-11-24). */}
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ gap: metrics.space.md }}>
        <Text variant="label" accessibilityRole="header">
          {t("doc.text.sheetTitle")}
        </Text>
        <TextInput
          testID="doc-text-input"
          value={draft.text}
          onChangeText={(text) => onChange({ text })}
          autoFocus
          accessibilityLabel={t("doc.text.sheetTitle")}
          style={{ minHeight: metrics.touch, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface }}
        />
        <Text variant="caption" tone="muted">
          {t("doc.text.fontInfo", { font: run.font || "—", size: Math.round(run.size * 10) / 10 })}
        </Text>
        <Text variant="caption" tone={missing.length ? "danger" : "muted"} testID="doc-text-glyphs" accessibilityLiveRegion="polite">
          {missing.length ? t("doc.text.missingGlyphs", { characters: missing.join(" ") }) : isRestyled(draft) ? t("doc.text.restyled") : t("doc.text.exactMatch")}
        </Text>
        <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
          <Chip testID="doc-text-bold" icon={Bold} label={t("doc.text.bold")} selected={Boolean(draft.bold)} onPress={() => onChange({ bold: !draft.bold })} />
          <Chip testID="doc-text-italic" icon={Italic} label={t("doc.text.italic")} selected={Boolean(draft.italic)} onPress={() => onChange({ italic: !draft.italic })} />
        </View>
        <SectionLabel>{t("doc.text.font")}</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
          {FAMILIES.map((f) => (
            <Chip key={f.key} testID={`doc-text-family-${f.key}`} label={t(f.label)} selected={(draft.family ?? "original") === f.key} onPress={() => onChange({ family: f.key })} />
          ))}
        </View>
        <Stepper
          testID="doc-text-size"
          label={t("doc.text.size")}
          value={t("doc.text.sizeValue", { n: size })}
          minusLabel={t("doc.text.smaller")}
          plusLabel={t("doc.text.bigger")}
          onMinus={() => onChange({ size: Math.max(SIZE_MIN, size - 1) })}
          onPlus={() => onChange({ size: Math.min(SIZE_MAX, size + 1) })}
        />
        <SectionLabel>{t("doc.text.textColor")}</SectionLabel>
        <Swatches testID="doc-text-color" values={TEXT_COLORS} value={draft.color ?? run.color} onChange={(color) => onChange({ color })} />
        <SectionLabel>{t("doc.text.highlight")}</SectionLabel>
        {/* Tap the chosen one again to take the highlight off (the web's toggle). */}
        <Swatches testID="doc-text-highlight" values={HIGHLIGHTS} value={draft.highlight ?? ""} onChange={(h) => onChange({ highlight: draft.highlight === h ? undefined : h })} />
      </ScrollView>
      <View testID="doc-text-sheet-actions" style={{ flexDirection: "row", gap: metrics.space.sm, paddingTop: metrics.space.md }}>
        <View style={{ flex: 1 }}>
          <Button testID="doc-text-clear" tone="neutral" label={t("doc.text.clearLine")} onPress={() => onChange({ text: "" })} />
        </View>
        <View style={{ flex: 1 }}>
          <Button testID="doc-text-done" label={t("doc.text.done")} onPress={onClose} />
        </View>
      </View>
    </KeyboardSheet>
  );
}
