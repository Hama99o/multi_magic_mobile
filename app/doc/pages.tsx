/**
 * PAGES: TURN, REMOVE, REORDER, EXTRACT, SPLIT (SPEC §C.7; web `PagesDoc.tsx`).
 *
 * Every page small, from one upload (G5). Tap pages to select them; the bar
 * under the grid turns, moves or removes the selection. On a phone a page is
 * too narrow for five buttons each, so the web's per-page buttons become one
 * bar acting on what is selected. Undo keeps 20 steps.
 *
 * Save sends the whole list (G2); Extract only the selected pages; One file
 * per page asks the server page by page (named like the web's zip) up to
 * DOC_PER_PAGE_LIMIT pages, and as one zip past that.
 *
 * The grid is a plain wrap of fixed-size cells, not a recycled list; a turned
 * page is a static `rotate` on its picture, nothing animates.
 */
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { Image as ExpoImage } from "expo-image";
import { DOC_PER_PAGE_LIMIT, baseName, docApi, type DocFile, type DocResult } from "@/api/doc";
import { ArrowDown, ArrowUp, Check, Layers, RotateCcw, RotateCw, Trash2, Undo2, type LucideIcon } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/reusables/button";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { APP_COLORS } from "@/theme/appColors";
import { BusyCard, ErrorLine, FileRow, IntakeCard, ResultSheet, useDocTask, useIntake, useRetry, useKeepUnsaved } from "@/screens/doc/ui";
import { inspectionProblem, useInspect, useThumbnails } from "@/screens/doc/pdf";
import { HISTORY, entriesFor, moveSelected, remove, rotate, splitName, toServer, type Entry } from "@/screens/doc/pageOps";

export default function PagesScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [file, setFile] = useState<DocFile | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<Entry[][]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<DocResult[] | null>(null);
  const task = useDocTask();
  const { remember, retry } = useRetry();
  // Work in progress asks before Change or Back drops it (review 88, D3).
  const { guard } = useKeepUnsaved(history.length > 0);

  const intake = useIntake("pdf", false, (files) => {
    setFile(files[0]);
    setEntries([]);
    setHistory([]);
    setSelected(new Set());
    task.clearError();
  });
  const inspect = useInspect(file);
  const thumbs = useThumbnails(file && inspect.data && !inspectionProblem(inspect.data) ? file : null, 200);
  const problem = inspectionProblem(inspect.data) ?? inspect.error ?? thumbs.error ?? null;

  useEffect(() => {
    // Every page of the PDF, not only those the server drew a picture for:
    // over its cap, Save used to send the first 300 and drop the rest (review
    // 88, D1). A page past the cap is kept, drawn as a blank sheet.
    if (thumbs.data && entries.length === 0 && history.length === 0) setEntries(entriesFor(thumbs.data.pageCount));
  }, [thumbs.data, entries.length, history.length]);

  const edit = (next: Entry[]) => {
    if (next === entries) return;
    setHistory((h) => [...h.slice(-(HISTORY - 1)), entries]);
    setEntries(next);
  };
  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setEntries(last);
  };

  // The grid's own width, measured: computed from the window it missed the
  // screen's padding and wrapped to ONE column at 360 dp (qa_phone3).
  const [gridWidth, setGridWidth] = useState(0);
  const columns = width >= 800 ? 5 : width >= 600 ? 4 : width >= 400 ? 3 : 2;
  const cell = gridWidth ? Math.floor((gridWidth - metrics.space.sm * (columns - 1)) / columns) : 0;
  const thumbOf = (source: number) => thumbs.data?.pages.find((p) => p.index === source);

  const base = file ? baseName(file.name) : "document";
  const save = remember("save", async (which: "all" | "extract") => {
    if (!file) return;
    const list = which === "all" ? entries : entries.filter((e) => selected.has(e.key));
    const result = await task.run((opts) => docApi.pages(file, toServer(list), false, which === "extract" ? { ...opts, as: `${base}-pages.pdf` } : opts));
    if (result) setResults([result]);
  });
  const split = remember("split", async () => {
    if (!file) return;
    const list = entries;
    const out = await task.run(async (opts) => {
      if (list.length > DOC_PER_PAGE_LIMIT) return [await docApi.pages(file, toServer(list), true, opts)];
      const files: DocResult[] = [];
      for (const [i, e] of list.entries()) {
        opts.step(i + 1, list.length);
        files.push(await docApi.pages(file, toServer([e]), false, { ...opts, as: splitName(base, i, list.length) }));
      }
      return files;
    });
    if (out) setResults(out);
  });

  const sel = selected;
  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <Screen measure={false}>
      <View style={{ paddingHorizontal: metrics.space.lg }}>
        <AppHeader app="doc" title={t("doc.tools.pages.title")} back />
      </View>
      <ScrollView contentContainerStyle={{ gap: metrics.space.md, padding: metrics.space.lg, width: "100%", maxWidth: metrics.maxMeasure * 1.4, alignSelf: "center" }}>
        {!file ? (
          <IntakeCard testID="doc-pages-intake" icon={Layers} help={t("doc.pages.help")} limits={t("doc.intake.pdfOnly")} onAdd={intake.openSheet} />
        ) : (
          <>
            <FileRow
              file={file}
              note={entries.length ? t("doc.pages.count", { count: entries.length }) : problem ? null : t("doc.file.checking")}
              right={
                <Pressable onPress={guard(intake.openSheet)} accessibilityRole="button" accessibilityLabel={t("doc.intake.change")} style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.sm }} testID="doc-pages-change">
                  <Text variant="label" tone="accent">
                    {t("doc.intake.change")}
                  </Text>
                </Pressable>
              }
            />
            <ErrorLine error={problem} name={file.name} />
            {!problem && !thumbs.data ? <BusyCard task={{ busy: true, progress: null, step: null, error: null, cancel: () => setFile(null) }} label={t("doc.file.checking")} /> : null}
            {thumbs.data?.truncated ? (
              <Text tone="muted" variant="caption">
                {t("doc.pages.truncated", { count: thumbs.data.pages.length })}
              </Text>
            ) : null}
            {thumbs.data ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
                  <Text variant="label" style={{ flex: 1 }} accessibilityLiveRegion="polite" testID="doc-pages-status">
                    {sel.size ? t("doc.pages.selected", { count: sel.size }) : t("doc.pages.count", { count: entries.length })}
                  </Text>
                  <Pressable
                    testID="doc-pages-undo"
                    onPress={undo}
                    disabled={history.length === 0}
                    accessibilityRole="button"
                    accessibilityLabel={t("doc.pages.undo")}
                    accessibilityState={{ disabled: history.length === 0 }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: metrics.touch, paddingHorizontal: metrics.space.sm, opacity: history.length ? 1 : 0.4 }}
                  >
                    <Undo2 size={18} color={colors.ink} />
                    <Text variant="label">{t("doc.pages.undo")}</Text>
                  </Pressable>
                </View>
                {entries.length === 0 ? (
                  <Text tone="muted">{t("doc.pages.allRemoved")}</Text>
                ) : (
                  <View onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)} style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }} testID="doc-pages-grid">
                    {cell > 0 && entries.map((e, i) => {
                      const th = thumbOf(e.source);
                      const on = sel.has(e.key);
                      return (
                        <Pressable
                          key={e.key}
                          testID={`doc-page-${e.source + 1}`}
                          onPress={() => toggle(e.key)}
                          accessibilityRole="checkbox"
                          accessibilityLabel={t("doc.pages.selectPage", { n: i + 1 })}
                          accessibilityState={{ checked: on }}
                          style={{ width: cell, gap: 4 }}
                        >
                          <View style={{ width: cell, height: cell * 1.3, borderRadius: metrics.radius.sm, borderWidth: on ? 3 : 1, borderColor: on ? APP_COLORS.doc : colors.border, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                            {th ? (
                              <ExpoImage
                                source={{ uri: th.uri }}
                                accessible={false}
                                contentFit="contain"
                                style={{ width: cell - 12, height: cell * 1.3 - 12, transform: [{ rotate: `${e.rotation}deg` }] }}
                              />
                            ) : null}
                            {on ? (
                              <View style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: APP_COLORS.doc, alignItems: "center", justifyContent: "center" }}>
                                <Check size={14} color="#04161a" />
                              </View>
                            ) : null}
                          </View>
                          <Text variant="caption" tone="muted" style={{ textAlign: "center" }}>
                            {String(i + 1)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                <BusyCard task={task} />
                <ErrorLine error={task.error} name={file.name} onDismiss={task.clearError} onRetry={() => retry({ save, split })} />
                <Button testID="doc-pages-save" label={t("doc.pages.saveAll")} disabled={task.busy || entries.length === 0} onPress={() => void save("all")} />
                <Button
                  testID="doc-pages-extract"
                  tone="neutral"
                  label={sel.size ? t("doc.pages.extract", { count: sel.size }) : t("doc.pages.extractNone")}
                  disabled={task.busy || sel.size === 0}
                  onPress={() => void save("extract")}
                />
                <Button testID="doc-pages-split" tone="neutral" label={t("doc.pages.split")} disabled={task.busy || entries.length < 2} onPress={() => void split()} />
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      {/* Pinned while pages are selected: under a long grid it was a scroll away (measured on qa_phone3). */}
      {file && thumbs.data && sel.size ? (
                  <View testID="doc-pages-bar" style={{ flexDirection: "row", marginHorizontal: metrics.space.lg, marginBottom: metrics.space.sm, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
                    <BarItem icon={RotateCcw} label={t("doc.pages.rotateLeft")} onPress={() => edit(rotate(entries, sel, -90))} testID="doc-pages-rotate-left" />
                    <BarItem icon={RotateCw} label={t("doc.pages.rotateRight")} onPress={() => edit(rotate(entries, sel, 90))} testID="doc-pages-rotate-right" />
                    <BarItem icon={ArrowUp} label={t("doc.pages.moveBack")} onPress={() => edit(moveSelected(entries, sel, -1))} testID="doc-pages-earlier" />
                    <BarItem icon={ArrowDown} label={t("doc.pages.moveForward")} onPress={() => edit(moveSelected(entries, sel, 1))} testID="doc-pages-later" />
                    <BarItem
                      icon={Trash2}
                      danger
                      label={t("doc.pages.deletePage")}
                      onPress={() => {
                        edit(remove(entries, sel));
                        setSelected(new Set());
                      }}
                      testID="doc-pages-delete"
                    />
                  </View>
      ) : null}
      {intake.sheet}
      <ResultSheet results={results} onClose={() => setResults(null)} />
    </Screen>
  );
}

function BarItem({ icon: Icon, label, onPress, testID, danger }: { icon: LucideIcon; label: string; onPress: () => void; testID: string; danger?: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1, minHeight: metrics.touch + 4, alignItems: "center", justifyContent: "center" }}>
      <Icon size={22} color={danger ? colors.danger : colors.ink} />
    </Pressable>
  );
}
