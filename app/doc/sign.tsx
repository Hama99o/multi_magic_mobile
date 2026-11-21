/**
 * SIGN A PDF OR A PHOTO (SPEC §C.3, §C.5; web Sign tab).
 *
 * 1. Add the document (a PDF or any picture).
 * 2. Pick a signature from the strip (or make one), tap the page to place it,
 *    then drag / pinch / twist, or use the bar under the page.
 * 3. Save: the server stamps it (G3) and the result goes to Share or Save.
 *    A picture can also come back as a one-page PDF.
 *
 * Stamps from different signatures are allowed: the server stamps one
 * signature per call, so each signature is a pass over the previous result.
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View, useWindowDimensions } from "react-native";
import { useNav } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView } from "react-native-gesture-handler";
import { Image as ExpoImage } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { docKeys } from "@/api/keys";
import { docApi, type DocFile, type DocResult, type Signature } from "@/api/doc";
import { ChevronLeft, ChevronRight, FileSignature, Plus } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/reusables/button";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { APP_COLORS } from "@/theme/appColors";
import { kindOf, needsServerPreview } from "@/screens/doc/files";
import { BusyCard, ErrorLine, FileRow, IntakeCard, ResultSheet, useDocTask, useIntake, useRetry } from "@/screens/doc/ui";
import { PdfPage, inspectionProblem, useInspect } from "@/screens/doc/pdf";
import { StampBar, StampView, placeAt, resize, toPlacements, turn, type Stamp } from "@/screens/doc/Placement";
import { useSignatures } from "@/screens/doc/useSignatures";

export default function SignScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [file, setFile] = useState<DocFile | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [signatureId, setSignatureId] = useState<number | null>(null);
  const [aspects, setAspects] = useState<Record<number, number>>({});
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [touching, setTouching] = useState(false);
  // The phone's own decoder failed on this picture (measured on qa_phone3: a
  // HEVC Main 10 HEIC drew nothing), so the server's JPEG copy stands in.
  const [nativeFailed, setNativeFailed] = useState(false);
  const [results, setResults] = useState<DocResult[] | null>(null);
  const task = useDocTask();
  const { remember, retry } = useRetry();

  const signatures = useSignatures();
  const rows = useMemo(() => signatures.data?.rows ?? [], [signatures.data]);
  const byId = useMemo(() => new Map(rows.map((s) => [s.id, s])), [rows]);

  // The web's rule: the active (or first) signature is picked on first load.
  useEffect(() => {
    if (signatureId === null && rows.length) setSignatureId((rows.find((s) => s.active) ?? rows[0]).id);
    if (signatureId !== null && rows.length && !byId.has(signatureId)) setSignatureId(rows[0]?.id ?? null);
  }, [rows, byId, signatureId]);

  const kind = file ? kindOf(file) : null;
  const inspect = useInspect(kind === "pdf" ? file : null);
  const problem = inspectionProblem(inspect.data) ?? (inspect.error ?? null);
  const pageCount = kind === "pdf" ? (inspect.data?.pages ?? 0) : 1;

  // A picture the phone cannot draw (TIFF, BMP, SVG…) is shown as a JPEG copy.
  const preview = useQuery({
    queryKey: docKeys.preview(file?.uri ?? ""),
    queryFn: async ({ signal }) => (await docApi.convertImage(file as DocFile, "jpg", { signal, max: 2000 })).uri,
    enabled: Boolean(file) && kind === "image" && (needsServerPreview(file as DocFile) || nativeFailed),
    staleTime: Infinity,
    retry: false,
  });
  const imageUri = kind === "image" && file ? (needsServerPreview(file) || nativeFailed ? (preview.data ?? null) : file.uri) : null;

  const intake = useIntake("any", false, (files) => {
    setFile(files[0]);
    setStamps([]);
    setSelected(null);
    setPageIndex(0);
    setImageAspect(null);
    setNativeFailed(false);
    setHint(null);
    task.clearError();
  });

  // The page fits the width, and its height fits the screen, so the bar and
  // the buttons stay on screen (web `DocImageSigner` fits both ways too).
  const contentWidth = Math.min(windowWidth, metrics.maxMeasure) - metrics.space.lg * 2;
  const aspect = kind === "pdf" ? (inspect.data?.sizes[pageIndex] ? inspect.data.sizes[pageIndex].height / inspect.data.sizes[pageIndex].width : 1.414) : (imageAspect ?? 1);
  const maxHeight = windowHeight * 0.5;
  const pageWidth = Math.max(160, Math.min(contentWidth, maxHeight / aspect));
  const pageHeight = pageWidth * aspect;

  const onPageTap = (x: number, y: number) => {
    if (selected) {
      setSelected(null);
      return;
    }
    if (signatureId === null) {
      setHint(t("doc.sign.pickFirst"));
      return;
    }
    const stamp = placeAt(kind === "pdf" ? pageIndex : 0, x / pageWidth, y / pageHeight, signatureId);
    setStamps((s) => [...s, stamp]);
    setSelected(stamp.key);
    setHint(null);
  };
  const pageTap = Gesture.Tap().runOnJS(true).onEnd((e) => onPageTap(e.x, e.y));

  const update = (key: string, fn: (s: Stamp) => Stamp) => setStamps((all) => all.map((s) => (s.key === key ? fn(s) : s)));
  const shownStamps = stamps.filter((s) => s.page === (kind === "pdf" ? pageIndex : 0));
  const selectedStamp = stamps.find((s) => s.key === selected) ?? null;

  const save = remember(async (output: "same" | "pdf") => {
    if (!file) return;
    if (stamps.length === 0) {
      setHint(t("doc.sign.placeFirst"));
      return;
    }
    const groups = new Map<number, Stamp[]>();
    for (const s of stamps) groups.set(s.signatureId, [...(groups.get(s.signatureId) ?? []), s]);
    const passes = [...groups.entries()];
    const result = await task.run(async (opts) => {
      let current: DocFile = file;
      let last: DocResult | null = null;
      for (const [i, [sigId, group]] of passes.entries()) {
        if (passes.length > 1) opts.step(i + 1, passes.length);
        const lastPass = i === passes.length - 1;
        last = await docApi.sign(current, toPlacements(group), sigId, lastPass ? output : "same", opts);
        // Later passes keep the original's name, not "-signed-signed".
        current = { ...last, name: file.name };
      }
      return last;
    });
    if (result) setResults([result]);
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Screen measure header={<AppHeader app="doc" title={t("doc.tools.sign.title")} back />}>
        <ScrollView contentContainerStyle={{ gap: metrics.space.md, paddingVertical: metrics.space.md }} scrollEnabled={!touching}>
          <SignatureStrip rows={rows} loading={signatures.isPending} failed={signatures.isError} selected={signatureId} onSelect={(id) => setSignatureId(id)} onAspect={(id, a) => setAspects((m) => (m[id] === a ? m : { ...m, [id]: a }))} />

          {!file ? (
            <IntakeCard testID="doc-sign-intake" icon={FileSignature} help={t("doc.sign.help")} limits={t("doc.intake.anyFile")} onAdd={intake.openSheet} />
          ) : (
            <>
              <FileRow
                file={file}
                note={kind === "pdf" && inspect.data ? t("doc.file.pages", { count: inspect.data.pages }) : kind === "pdf" && inspect.isPending ? t("doc.file.checking") : null}
                right={
                  <Pressable onPress={intake.openSheet} accessibilityRole="button" accessibilityLabel={t("doc.intake.change")} style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.sm }} testID="doc-sign-change">
                    <Text variant="label" tone="accent">
                      {t("doc.intake.change")}
                    </Text>
                  </Pressable>
                }
              />
              <ErrorLine error={problem} name={file.name} />
              {!problem && (kind === "image" || inspect.data) ? (
                <>
                  <Text variant="caption" tone="muted" accessibilityLiveRegion="polite" testID="doc-sign-hint">
                    {hint ?? t("doc.sign.tapToPlace")}
                  </Text>
                  <View style={{ alignItems: "center" }}>
                    <GestureDetector gesture={pageTap}>
                      <View collapsable={false} testID="doc-sign-page">
                        {kind === "pdf" ? (
                          <PdfPage file={file} page={pageIndex} width={pageWidth} aspect={aspect}>
                            {shownStamps.map((s) => (
                              <StampView key={s.key} stamp={s} page={{ width: pageWidth, height: pageHeight }} imageUri={byId.get(s.signatureId)?.imageUrl ?? null} aspect={aspects[s.signatureId] ?? 3} selected={selected === s.key} onSelect={() => setSelected(s.key)} onChange={(n) => update(s.key, () => n)} onActive={setTouching} />
                            ))}
                          </PdfPage>
                        ) : (
                          <View style={{ width: pageWidth, height: pageHeight, backgroundColor: colors.surface }}>
                            {!imageUri && preview.isFetching ? (
                              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                                <ActivityIndicator color={colors.accent} />
                              </View>
                            ) : null}
                            {imageUri ? (
                              <ExpoImage
                                source={{ uri: imageUri }}
                                style={{ width: pageWidth, height: pageHeight }}
                                contentFit="contain"
                                accessible={false}
                                onLoad={(e) => e.source.width && e.source.height && setImageAspect(e.source.height / e.source.width)}
                                onError={() => setNativeFailed(true)}
                              />
                            ) : null}
                            {shownStamps.map((s) => (
                              <StampView key={s.key} stamp={s} page={{ width: pageWidth, height: pageHeight }} imageUri={byId.get(s.signatureId)?.imageUrl ?? null} aspect={aspects[s.signatureId] ?? 3} selected={selected === s.key} onSelect={() => setSelected(s.key)} onChange={(n) => update(s.key, () => n)} onActive={setTouching} />
                            ))}
                          </View>
                        )}
                      </View>
                    </GestureDetector>
                  </View>
                  {kind === "pdf" && pageCount > 1 ? (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: metrics.space.md }}>
                      <PagerButton label={t("doc.sign.previous")} disabled={pageIndex === 0} onPress={() => setPageIndex((p) => p - 1)} icon="prev" />
                      <Text variant="label" testID="doc-sign-page-of">
                        {t("doc.sign.pageOf", { n: pageIndex + 1, total: pageCount })}
                      </Text>
                      <PagerButton label={t("doc.sign.next")} disabled={pageIndex >= pageCount - 1} onPress={() => setPageIndex((p) => p + 1)} icon="next" />
                    </View>
                  ) : null}
                  {selectedStamp ? (
                    <StampBar
                      onSmaller={() => update(selectedStamp.key, (s) => resize(s, 0.85))}
                      onBigger={() => update(selectedStamp.key, (s) => resize(s, 1.15))}
                      onTurn={() => update(selectedStamp.key, (s) => turn(s, 15))}
                      onRemove={() => {
                        setStamps((all) => all.filter((s) => s.key !== selectedStamp.key));
                        setSelected(null);
                      }}
                    />
                  ) : null}
                  {stamps.length ? (
                    <Text variant="caption" tone="muted" testID="doc-sign-count">
                      {t("doc.sign.placed", { count: stamps.length })}
                    </Text>
                  ) : null}
                  <BusyCard task={task} />
                  <ErrorLine error={task.error} name={file.name} onDismiss={task.clearError} onRetry={retry} />
                  <Button testID="doc-sign-save" label={t("doc.sign.save")} disabled={task.busy} onPress={() => void save("same")} />
                  {kind === "image" ? <Button testID="doc-sign-save-pdf" tone="neutral" label={t("doc.sign.saveAsPdf")} disabled={task.busy} onPress={() => void save("pdf")} /> : null}
                </>
              ) : kind === "pdf" && inspect.isPending ? (
                <BusyCard task={{ busy: true, progress: null, step: null, error: null, cancel: () => setFile(null) }} label={t("doc.file.checking")} />
              ) : null}
            </>
          )}
        </ScrollView>
        {intake.sheet}
        <ResultSheet results={results} onClose={() => setResults(null)} />
      </Screen>
    </GestureHandlerRootView>
  );
}

function PagerButton({ label, disabled, onPress, icon }: { label: string; disabled: boolean; onPress: () => void; icon: "prev" | "next" }) {
  const colors = useColors();
  const metrics = useMetrics();
  const Icon = icon === "prev" ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      testID={`doc-pager-${icon}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{ width: metrics.touch, height: metrics.touch, borderRadius: metrics.touch / 2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, opacity: disabled ? 0.4 : 1 }}
    >
      <Icon size={22} color={colors.ink} />
    </Pressable>
  );
}

/** The library as a strip: pick one, add one, manage them. */
function SignatureStrip({ rows, loading, failed, selected, onSelect, onAspect }: { rows: Signature[]; loading: boolean; failed: boolean; selected: number | null; onSelect: (id: number) => void; onAspect: (id: number, aspect: number) => void }) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const card = { width: 132, height: 72, borderRadius: metrics.radius.md } as const;
  return (
    <View style={{ gap: metrics.space.sm }} testID="doc-sign-strip">
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text variant="label" tone="muted" accessibilityRole="header" style={{ flex: 1 }}>
          {t("doc.sign.yourSignatures")}
        </Text>
        {rows.length ? (
          <Pressable testID="doc-sign-manage" onPress={() => router.push("/doc/signatures")} accessibilityRole="button" accessibilityLabel={t("doc.sign.manage")} style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.sm }}>
            <Text variant="label" tone="accent">
              {t("doc.sign.manage")}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {failed ? (
        <Text tone="danger">{t("doc.signatures.loadFailed")}</Text>
      ) : !loading && rows.length === 0 ? (
        <View style={{ gap: metrics.space.sm }}>
          <Text tone="muted">{t("doc.sign.noSignatures")}</Text>
          <Button testID="doc-sign-create-first" tone="neutral" label={t("doc.sign.createFirst")} onPress={() => router.push("/doc/signature")} />
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: metrics.space.sm }}>
          {rows.map((s) => {
            const on = s.id === selected;
            return (
              <Pressable
                key={s.id}
                testID={`doc-sign-pick-${s.id}`}
                onPress={() => onSelect(s.id)}
                accessibilityRole="button"
                accessibilityLabel={s.name}
                accessibilityState={{ selected: on }}
                style={{ ...card, backgroundColor: "#ffffff", borderWidth: on ? 3 : 1, borderColor: on ? APP_COLORS.doc : colors.border, padding: 6 }}
              >
                {s.imageUrl ? (
                  <ExpoImage
                    source={{ uri: s.imageUrl }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="contain"
                    accessible={false}
                    onLoad={(e) => e.source.width && e.source.height && onAspect(s.id, e.source.width / e.source.height)}
                  />
                ) : (
                  <Text numberOfLines={1} style={{ color: "#0f172a" }}>
                    {s.text ?? s.name}
                  </Text>
                )}
              </Pressable>
            );
          })}
          <Pressable
            testID="doc-sign-add"
            onPress={() => router.push("/doc/signature")}
            accessibilityRole="button"
            accessibilityLabel={t("doc.signatures.add")}
            style={{ ...card, width: 72, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
          >
            <Plus size={22} color={colors.ink} />
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}
