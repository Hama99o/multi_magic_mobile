/**
 * MERGE PDFs AND PHOTOS INTO ONE PDF (SPEC §C.6; web `MergePdf.tsx`).
 *
 * Files in the order you want: each card shows its first page (or the photo),
 * its page count, and up/down arrows — the web's own choice for Pages,
 * because arrows work with one thumb and a screen reader, where a drag does
 * not. A locked or damaged PDF is marked by name and the rest stay.
 * The server merges (G1): every page fitted into A4, PDFs kept as vectors.
 *
 * At most 30 files: a plain ScrollView, not a recycled list, and no cell
 * moves by animation (owner's list rule).
 */
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQueries } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { docKeys } from "@/api/keys";
import { docApi, type DocError, type DocFile, type DocResult, type PdfInspection } from "@/api/doc";
import { ArrowDown, ArrowUp, Check, Combine, FileImage, X } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/reusables/button";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { checkMerge, kindOf, moveItem } from "@/screens/doc/files";
import { AddMoreRow, BusyCard, ErrorLine, IntakeCard, ResultSheet, reasonText, useDocTask, useIntake, useRetry } from "@/screens/doc/ui";
import { inspectionProblem, usePageImage } from "@/screens/doc/pdf";
import { formatBytes } from "@/screens/pages/parts";

interface Item {
  key: string;
  file: DocFile;
}

let counter = 0;
const keyed = (file: DocFile): Item => ({ key: `${Date.now()}-${counter++}`, file });

export default function MergeScreen() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<DocResult[] | null>(null);
  const task = useDocTask();
  const { remember, retry } = useRetry();

  const intake = useIntake("any", true, (files) => setItems((now) => [...now, ...files.map(keyed)]));

  // Every PDF inspected (page count, why it cannot be used), cached per file.
  const inspections = useQueries({
    queries: items.map((it) => ({
      queryKey: docKeys.inspect(it.file.uri),
      queryFn: ({ signal }: { signal: AbortSignal }) => docApi.inspect(it.file, { signal }),
      enabled: kindOf(it.file) === "pdf",
      staleTime: Infinity,
      retry: false,
    })),
  });
  const infoOf = (i: number): { info?: PdfInspection; problem: DocError | null; checking: boolean } => {
    const q = inspections[i];
    if (kindOf(items[i].file) !== "pdf") return { problem: null, checking: false };
    return { info: q?.data, problem: inspectionProblem(q?.data) ?? ((q?.error as DocError | null) ?? null), checking: Boolean(q?.isPending) };
  };

  const totalPages = items.reduce((n, it, i) => n + (kindOf(it.file) === "pdf" ? (inspections[i]?.data?.pages ?? 0) : 1), 0);
  const anyProblem = items.some((_, i) => infoOf(i).problem);
  const limit = useMemo(() => checkMerge(items.map((i) => i.file)), [items]);

  const merge = remember(async () => {
    const result = await task.run((opts) => docApi.merge(items.map((i) => i.file), opts));
    if (result) setResults([result]);
  });

  const clearAll = () =>
    Alert.alert(t("doc.merge.clearTitle"), t("doc.merge.clearBody"), [
      { text: t("doc.signatures.cancel"), style: "cancel" },
      {
        text: t("doc.merge.clearAll"),
        style: "destructive",
        onPress: () => {
          setItems([]);
          setSelected(new Set());
        },
      },
    ]);

  return (
    <Screen measure header={<AppHeader app="doc" title={t("doc.tools.merge.title")} back />}>
      <ScrollView contentContainerStyle={{ gap: metrics.space.md, paddingVertical: metrics.space.md }}>
        {items.length === 0 ? (
          <IntakeCard testID="doc-merge-intake" icon={Combine} help={t("doc.merge.help")} limits={`${t("doc.intake.anyFile")} ${t("doc.intake.mergeLimit")}`} onAdd={intake.openSheet} />
        ) : (
          <>
            {items.map((it, i) => {
              const { info, problem, checking } = infoOf(i);
              return (
                <MergeRow
                  key={it.key}
                  item={it}
                  pages={kindOf(it.file) === "pdf" ? (info?.pages ?? null) : 1}
                  aspect={info?.sizes[0] ? info.sizes[0].height / info.sizes[0].width : 1.414}
                  checking={checking}
                  problem={problem ? reasonText(t, problem) : null}
                  selected={selected.has(it.key)}
                  first={i === 0}
                  last={i === items.length - 1}
                  onToggle={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (n.has(it.key)) n.delete(it.key);
                      else n.add(it.key);
                      return n;
                    })
                  }
                  onMove={(by) => setItems((list) => moveItem(list, i, by))}
                  onRemove={() => {
                    setItems((list) => list.filter((x) => x.key !== it.key));
                    setSelected((s) => {
                      const n = new Set(s);
                      n.delete(it.key);
                      return n;
                    });
                  }}
                />
              );
            })}
            <AddMoreRow onPress={intake.openSheet} />
            <Text variant="caption" tone="muted" testID="doc-merge-summary">
              {`${t("doc.merge.count", { count: items.length })} · ${t("doc.merge.totalPages", { count: totalPages })}`}
            </Text>
            <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
              {selected.size ? (
                <View style={{ flex: 1 }}>
                  <Button
                    testID="doc-merge-delete-selected"
                    tone="neutral"
                    label={t("doc.merge.deleteSelected", { count: selected.size })}
                    onPress={() => {
                      setItems((list) => list.filter((x) => !selected.has(x.key)));
                      setSelected(new Set());
                    }}
                  />
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Button testID="doc-merge-clear" tone="neutral" label={t("doc.merge.clearAll")} onPress={clearAll} />
              </View>
            </View>
            {limit ? (
              <Text tone="danger" testID="doc-merge-limit">
                {limit.reason === "too_large" ? t("doc.errors.too_large_merge") : t("doc.errors.too_many_files")}
              </Text>
            ) : null}
            {anyProblem ? (
              <Text tone="danger" testID="doc-merge-fix">
                {t("doc.merge.fixProblems")}
              </Text>
            ) : items.length < 2 ? (
              <Text tone="muted">{t("doc.merge.needTwo")}</Text>
            ) : null}
            <BusyCard task={task} />
            <ErrorLine error={task.error} onDismiss={task.clearError} onRetry={retry} />
            <Button testID="doc-merge-go" label={t("doc.merge.merge")} disabled={items.length < 2 || anyProblem || Boolean(limit) || task.busy} onPress={() => void merge()} />
          </>
        )}
      </ScrollView>
      {intake.sheet}
      <ResultSheet results={results} onClose={() => setResults(null)} />
    </Screen>
  );
}

const ROW = 88;

function MergeRow({
  item,
  pages,
  aspect,
  checking,
  problem,
  selected,
  first,
  last,
  onToggle,
  onMove,
  onRemove,
}: {
  item: Item;
  pages: number | null;
  aspect: number;
  checking: boolean;
  problem: string | null;
  selected: boolean;
  first: boolean;
  last: boolean;
  onToggle: () => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const isPdf = kindOf(item.file) === "pdf";
  // The phone's decoder may refuse a picture the server reads (a 10-bit HEIC).
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = usePageImage(isPdf && !problem && !checking ? item.file : null, 0, 56);
  const name = item.file.name;
  const icon = (Icon: typeof ArrowUp, label: string, onPress: () => void, id: string, disabled = false) => (
    <Pressable
      testID={`doc-merge-${id}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{ width: 44, height: metrics.touch, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.3 : 1 }}
    >
      <Icon size={20} color={colors.ink} />
    </Pressable>
  );
  return (
    <View
      testID="doc-merge-row"
      style={{ minHeight: ROW, flexDirection: "row", alignItems: "center", gap: metrics.space.sm, padding: metrics.space.sm, borderRadius: metrics.radius.md, borderWidth: problem ? 1.5 : 1, borderColor: problem ? colors.danger : selected ? colors.accent : colors.border, backgroundColor: colors.surface }}
    >
      <Pressable
        testID="doc-merge-select"
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityLabel={t("doc.merge.select", { name })}
        accessibilityState={{ checked: selected }}
        style={{ width: 36, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: selected ? colors.accent : colors.inkMuted, backgroundColor: selected ? colors.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
          {selected ? <Check size={14} color={colors.onAccent} /> : null}
        </View>
      </Pressable>
      {/* Paper in both themes: a page is white (SPEC §B). */}
      <View style={{ width: 52, height: 68, borderRadius: 4, backgroundColor: "#ffffff", overflow: "hidden", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
        {thumbFailed ? (
          <FileImage size={24} color={colors.inkMuted} />
        ) : isPdf ? (
          thumb.data ? <ExpoImage source={{ uri: thumb.data }} style={{ width: 52, height: Math.min(68, 52 * aspect) }} contentFit="contain" transition={120} accessible={false} /> : null
        ) : (
          <ExpoImage source={{ uri: item.file.uri }} style={{ width: 52, height: 68 }} contentFit="cover" accessible={false} onError={() => setThumbFailed(true)} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="label" numberOfLines={2}>
          {name}
        </Text>
        <Text variant="caption" tone={problem ? "danger" : "muted"} numberOfLines={problem ? undefined : 3}>
          {problem ??
            [isPdf ? (checking ? t("doc.file.checking") : pages !== null ? t("doc.file.pages", { count: pages }) : null) : t("doc.merge.picture"), formatBytes(item.file.size, t, i18n.language)].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <View>
        {icon(ArrowUp, t("doc.merge.moveUp", { name }), () => onMove(-1), "up", first)}
        {icon(ArrowDown, t("doc.merge.moveDown", { name }), () => onMove(1), "down", last)}
      </View>
      {icon(X, t("doc.file.remove", { name }), onRemove, "remove")}
    </View>
  );
}
