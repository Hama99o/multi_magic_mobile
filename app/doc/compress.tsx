/**
 * COMPRESS (SPEC §C.10; web `CompressDoc.tsx`).
 *
 * Basic, Strong, or a target in MB (0.1–49, the server's clamp). Every change
 * re-runs the compression as a preview (a query), cancelling the one before (800 ms
 * after typing a target), so the new size is known BEFORE saving, and Save
 * hands over that same file — no second request. The server never returns a
 * bigger file; "already as small as it gets" and "could not reach the target"
 * are said rather than hidden.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { docKeys } from "@/api/keys";
import { ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Image as ExpoImage } from "expo-image";
import { docApi, type Compressed, type CompressMode, type DocError, type DocFile, type DocResult, type Progress } from "@/api/doc";
import { Shrink } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/reusables/button";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { formatBytes } from "@/screens/pages/parts";
import { kindOf, parseTarget } from "@/screens/doc/files";
import { Chip, SectionLabel } from "@/screens/doc/controls";
import { BusyCard, ErrorLine, FileRow, IntakeCard, ResultSheet, useIntake } from "@/screens/doc/ui";

const DEBOUNCE_MS = 800;
const MB = 1024 * 1024;

export default function CompressScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [file, setFile] = useState<DocFile | null>(null);
  const [mode, setMode] = useState<CompressMode>("basic");
  const [targetText, setTargetText] = useState("");
  const [target, setTarget] = useState<number | null>(null);
  const [results, setResults] = useState<DocResult[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [stopped, setStopped] = useState(false);
  const intake = useIntake("any", false, (files) => {
    setFile(files[0]);
    setStopped(false);
  });

  useEffect(() => {
    const id = setTimeout(() => setTarget(parseTarget(targetText)), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [targetText]);

  // The preview: a query per (file, mode, target), so a change supersedes the
  // one before and React Query cancels it (its signal reaches the request),
  // and going back to an earlier mode shows that answer without asking again.
  const client = useQueryClient();
  const key = docKeys.compress(file?.uri ?? "", mode, target ?? 0);
  const preview = useQuery<Compressed, DocError>({
    queryKey: key,
    queryFn: ({ signal }) => docApi.compress(file as DocFile, mode, target ?? undefined, { signal, onProgress: setProgress }),
    enabled: Boolean(file) && !stopped && (mode !== "custom" || target !== null),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: false,
  });
  const outcome = preview.data ? { ...preview.data, mode, target } : null;
  const busy = { busy: preview.isFetching, progress, step: null, error: null, cancel: () => {
    setStopped(true);
    void client.cancelQueries({ queryKey: key });
  } };
  const previewError = preview.error && preview.error.reason !== "cancelled" ? preview.error : null;

  const reduced = outcome && outcome.originalSize > 0 ? Math.round((1 - outcome.compressedSize / outcome.originalSize) * 100) : 0;
  const noReduction = outcome !== null && outcome.compressedSize >= outcome.originalSize;
  const missed = outcome?.mode === "custom" && outcome.target !== null && outcome.compressedSize > outcome.target * MB * 1.02;
  const isImage = file ? kindOf(file) === "image" : false;

  const modes: { key: CompressMode; title: string; sub: string }[] = [
    { key: "basic", title: t("doc.compress.basic"), sub: t("doc.compress.basicSub") },
    { key: "strong", title: t("doc.compress.strong"), sub: t("doc.compress.strongSub") },
    { key: "custom", title: t("doc.compress.custom"), sub: t("doc.compress.customSub") },
  ];

  return (
    <Screen measure avoidKeyboard>
      <AppHeader app="doc" title={t("doc.tools.compress.title")} back />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: metrics.space.md, paddingVertical: metrics.space.md }}>
        {!file ? (
          <IntakeCard testID="doc-compress-intake" icon={Shrink} help={t("doc.compress.help")} limits={t("doc.intake.anyFile")} onAdd={intake.openSheet} />
        ) : (
          <>
            <FileRow file={file} onClear={() => setFile(null)} />
            <SectionLabel>{t("doc.compress.mode")}</SectionLabel>
            <View accessibilityRole="radiogroup" style={{ gap: metrics.space.sm }} testID="doc-compress-modes">
              {modes.map((m) => (
                <View key={m.key} style={{ gap: 2 }}>
                  <Chip testID={`doc-compress-${m.key}`} label={m.title} selected={mode === m.key} onPress={() => {
                      setMode(m.key);
                      setStopped(false);
                    }} />
                  <Text variant="caption" tone="muted" style={{ paddingHorizontal: metrics.space.lg }}>
                    {m.sub}
                  </Text>
                </View>
              ))}
            </View>
            {mode === "custom" ? (
              <View style={{ gap: 4 }}>
                <Text variant="label">{t("doc.compress.target")}</Text>
                <TextInput
                  testID="doc-compress-target"
                  value={targetText}
                  onChangeText={(v) => {
                    setTargetText(v);
                    setStopped(false);
                  }}
                  keyboardType="decimal-pad"
                  placeholder="1.5"
                  placeholderTextColor={colors.inkMuted}
                  accessibilityLabel={t("doc.compress.target")}
                  accessibilityHint={t("doc.compress.targetHint")}
                  style={{ minHeight: metrics.touch, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface }}
                />
                <Text variant="caption" tone="muted">
                  {t("doc.compress.targetHint")}
                </Text>
              </View>
            ) : null}
            <BusyCard task={busy} label={t("doc.compress.previewing")} />
            <ErrorLine error={previewError} name={file.name} />
            {outcome ? (
              <View testID="doc-compress-outcome" style={{ gap: metrics.space.sm }}>
                <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
                  <SizeCard label={t("doc.compress.before")} size={formatBytes(outcome.originalSize, t, i18n.language)} />
                  <SizeCard label={t("doc.compress.after")} size={formatBytes(outcome.compressedSize, t, i18n.language)} strong />
                </View>
                {isImage && !noReduction ? (
                  <ExpoImage source={{ uri: outcome.result.uri }} style={{ width: "100%", height: 200, borderRadius: metrics.radius.md, backgroundColor: colors.surface }} contentFit="contain" accessible={false} />
                ) : null}
                <Text variant="label" tone={noReduction || missed ? "danger" : "accent"} accessibilityLiveRegion="polite" testID="doc-compress-verdict">
                  {noReduction ? t("doc.compress.noReduction") : missed ? t("doc.compress.targetNotMet", { target: outcome.target }) : t("doc.compress.reduced", { percent: reduced })}
                </Text>
                {!noReduction ? <Button testID="doc-compress-save" label={t("doc.result.save")} onPress={() => setResults([outcome.result])} /> : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      {intake.sheet}
      <ResultSheet results={results} onClose={() => setResults(null)} />
    </Screen>
  );
}

function SizeCard({ label, size, strong }: { label: string; size: string; strong?: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View style={{ flex: 1, padding: metrics.space.md, borderRadius: metrics.radius.md, borderWidth: strong ? 2 : 1, borderColor: strong ? colors.accent : colors.border, backgroundColor: colors.surface, gap: 2 }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="title" style={{ fontSize: 22, lineHeight: 28 }}>
        {size}
      </Text>
    </View>
  );
}
