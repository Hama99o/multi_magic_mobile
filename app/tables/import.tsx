/**
 * TABLES: IMPORT (increment 7; the web's `ImportPanel.tsx`): a file or a
 * paste into this table, in three steps on one screen.
 *   1. What to import: a file (CSV, Excel, ODS) or pasted text (Excel cells,
 *      a CSV, a WhatsApp list).
 *   2. How it maps: each column of the sheet goes to a column of the table,
 *      to a new column of the guessed type (people who manage the base), or
 *      is left out; "N values would be refused (first: X)" before anything
 *      is sent; optionally, update the rows whose key matches (upsert).
 *   3. Start: the server imports in the background; the table shows its
 *      progress, a Stop, and the counts when it is done.
 * Reading is `importFlow.ts`; the rules are `importSheet.ts`; both tested.
 */
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { File, Paths } from "expo-file-system";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { tablesApi } from "@/api/tables";
import { MAX_IMPORT_BYTES, previewRefusal, tableImportsApi, type LocalFile, type Sheet } from "@/api/tableImports";
import { failureMessage } from "@/api/failure";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { SheetButton } from "@/components/fields/FieldRow";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { canEditRows } from "@/screens/tables/logic";
import { readForImport } from "@/screens/tables/importFlow";
import { defaultTarget, IMPORT_TYPES, importColumns, type ImportType, type Target } from "@/screens/tables/importSheet";
import { explainPick, pickDocuments } from "@/screens/pages/addFiles";

type Step = { kind: "source" } | { kind: "paste" } | { kind: "reading" } | { kind: "map"; sheet: Sheet; targets: Target[]; upsert: number | null };

/** A stable key for the same file and choices: a double tap or a retry starts one import, not two (the web's idempotencyKey). */
function importKey(sheet: Sheet, columns: unknown[]): string {
  const text = JSON.stringify([sheet.source.filename, sheet.rowCount, sheet.headers, columns, sheet.source.kind === "upload" ? sheet.source.upload : sheet.source.csv.length]);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `m-${(h >>> 0).toString(36)}-${text.length}`;
}

export default function ImportScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const params = useLocalSearchParams<{ table: string }>();
  const tableId = Number(params.table);
  const table = useQuery({ queryKey: tablesKeys.table(tableId), queryFn: () => tablesApi.table(tableId), enabled: Number.isFinite(tableId) });
  const bases = useQuery({ queryKey: tablesKeys.bases("created_at_desc"), queryFn: () => tablesApi.bases(), enabled: Boolean(table.data) });
  const base = bases.data?.find((b) => b.id === table.data?.baseId);
  const canManage = canEditRows(base?.role);
  // The mapping's defaults read the table's columns and the person's role: nothing is read before both are here,
  // or every column would start as "leave out" (found by the preview test, 2026-11-21).
  const ready = Boolean(table.data && base);
  const fields = useMemo(() => (table.data?.fields ?? []).filter((f) => !["multi_record", "lookup", "rollup", "created_time", "last_modified_time", "attachments"].includes(f.fieldType)), [table.data]);
  const [step, setStep] = useState<Step>({ kind: "source" });
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const read = async (input: Parameters<typeof readForImport>[0]) => {
    setMessage(null);
    setStep({ kind: "reading" });
    const out = await readForImport(input, {
      preview: (file) => tableImportsApi.preview(tableId, { file }),
      refusal: previewRefusal,
      readText: async (uri) => await new File(uri).text(),
      saveCsv: (csv, name) => {
        const file = new File(Paths.cache, `${Date.now()}-${name}`);
        file.create();
        file.write(csv);
        return { uri: file.uri, name, mimeType: "text/csv" };
      },
      tableColumnNames: (table.data?.fields ?? []).map((f) => f.name),
      columnName: (n) => t("tables.import.columnN", { n }),
      maxBytes: MAX_IMPORT_BYTES,
    });
    if (out.kind === "refused") {
      setMessage(t(`tables.import.refused.${out.reason}`));
      setStep({ kind: "source" });
      return;
    }
    setStep({ kind: "map", sheet: out.sheet, targets: out.sheet.headers.map((_, i) => defaultTarget(out.sheet, i, fields, canManage)), upsert: null });
  };

  const pickFile = async () => {
    const files = explainPick(await pickDocuments(), t);
    const f = files?.[0];
    if (!f) return;
    await read({ kind: "file", file: { uri: f.uri, name: f.name ?? "import", mimeType: f.mimeType ?? "application/octet-stream", size: f.size } });
  };

  const start = async () => {
    if (step.kind !== "map" || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const columns = importColumns(step.sheet, step.targets);
      const source: { upload: string } | { file: LocalFile } =
        step.sheet.source.kind === "upload"
          ? { upload: step.sheet.source.upload }
          : (() => {
              const file = new File(Paths.cache, `${Date.now()}-${step.sheet.source.filename.replace(/\.[^.]+$/, "")}.csv`);
              file.create();
              file.write(step.sheet.source.csv);
              return { file: { uri: file.uri, name: step.sheet.source.filename.replace(/\.[^.]+$/, "") + ".csv", mimeType: "text/csv" } };
            })();
      await tableImportsApi.create(tableId, source, columns, { upsertOn: step.upsert, idempotencyKey: importKey(step.sheet, columns) });
      await client.invalidateQueries({ queryKey: tablesKeys.imports(tableId) });
      router.back();
    } catch (e) {
      setMessage(failureMessage(e, t("tables.import.failed")));
    } finally {
      setBusy(false);
    }
  };

  const pill = (on: boolean) => ({ minHeight: 32, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center" as const, borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.surface });

  return (
    <Screen measure>
      <AppHeader app="tables" back title={t("tables.import.title", { table: table.data?.name ?? "" })} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: metrics.space.sm, paddingBottom: metrics.space.xl }}>
        {step.kind === "source" ? (
          <>
            <Text tone="muted">{t("tables.import.intro")}</Text>
            <SheetButton testID="tables-import-file" label={t("tables.import.pickFile")} disabled={!ready} busy={!ready} onPress={() => void pickFile()} />
            <SheetButton testID="tables-import-paste" label={t("tables.import.paste")} tone="neutral" disabled={!ready} onPress={() => setStep({ kind: "paste" })} />
            <Text tone="muted" variant="caption">
              {t("tables.import.formats")}
            </Text>
          </>
        ) : null}

        {step.kind === "paste" ? (
          <>
            <Text tone="muted">{t("tables.import.pasteHint")}</Text>
            <TextInput testID="tables-import-text" value={text} onChangeText={setText} multiline autoFocus placeholder={t("tables.import.pastePlaceholder")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("tables.import.paste")} style={{ minHeight: 160, maxHeight: 320, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, padding: metrics.space.md, color: colors.ink, fontSize: 15, backgroundColor: colors.surface, textAlignVertical: "top" }} />
            <SheetButton testID="tables-import-read" label={t("tables.import.read")} disabled={!text.trim()} onPress={() => void read({ kind: "paste", text })} />
          </>
        ) : null}

        {step.kind === "reading" ? (
          <View testID="tables-import-reading" style={{ alignItems: "center", gap: metrics.space.sm, padding: metrics.space.xl }}>
            <ActivityIndicator />
            <Text tone="muted">{t("tables.import.reading")}</Text>
          </View>
        ) : null}

        {step.kind === "map" ? (
          <>
            <Text variant="label" testID="tables-import-summary">
              {t("tables.import.summary", { count: step.sheet.rowCount, columns: step.targets.filter((x) => x !== "skip").length, total: step.sheet.headers.length })}
            </Text>
            {step.sheet.sheets.length > 1 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
                {step.sheet.sheets.map((s) => (
                  <Pressable
                    key={s.index}
                    testID={`tables-import-sheet-${s.index}`}
                    onPress={() => {
                      if (step.sheet.source.kind !== "upload" || s.index === step.sheet.sheet) return;
                      const upload = step.sheet.source.upload;
                      setStep({ kind: "reading" });
                      void tableImportsApi
                        .preview(tableId, { upload, sheet: s.index })
                        .then((sheet) => setStep({ kind: "map", sheet, targets: sheet.headers.map((_, i) => defaultTarget(sheet, i, fields, canManage)), upsert: null }))
                        .catch((e: unknown) => {
                          setMessage(t(`tables.import.refused.${previewRefusal(e)}`));
                          setStep({ kind: "source" });
                        });
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: s.index === step.sheet.sheet }}
                    accessibilityLabel={s.name}
                    style={pill(s.index === step.sheet.sheet)}
                  >
                    <Text variant="caption" tone={s.index === step.sheet.sheet ? "onAccent" : "default"}>
                      {s.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {step.sheet.truncated ? (
              <Text tone="muted" variant="caption" testID="tables-import-truncated">
                {t("tables.import.truncated")}
              </Text>
            ) : null}
            {step.sheet.headers.map((header, i) => {
              const target = step.targets[i];
              const guess = step.sheet.guesses[i];
              const set = (to: Target) => setStep({ ...step, targets: step.targets.map((x, j) => (j === i ? to : x)) });
              const targetType = target.startsWith("field:") ? fields.find((f) => `field:${f.id}` === target)?.fieldType : target.startsWith("new:") ? target.slice(4) : null;
              const refused = targetType && targetType in guess.refused ? guess.refused[targetType as keyof typeof guess.refused] : null;
              return (
                <View key={i} testID={`tables-import-column-${i}`} style={{ gap: metrics.space.xs, padding: metrics.space.sm, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border, opacity: target === "skip" ? 0.6 : 1 }}>
                  <Text variant="label">{step.sheet.unnamed[i] ? t("tables.import.unnamed", { n: i + 1 }) : header}</Text>
                  <Text tone="muted" variant="caption" numberOfLines={1}>
                    {guess.samples.length ? guess.samples.join(" · ") : t("tables.import.emptyColumn")}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: metrics.space.xs }}>
                    <Pressable testID={`tables-import-column-${i}-skip`} onPress={() => set("skip")} accessibilityRole="radio" accessibilityState={{ selected: target === "skip" }} accessibilityLabel={t("tables.import.skip")} style={pill(target === "skip")}>
                      <Text variant="caption" tone={target === "skip" ? "onAccent" : "default"}>
                        {t("tables.import.skip")}
                      </Text>
                    </Pressable>
                    {fields.map((f) => {
                      const on = target === `field:${f.id}`;
                      return (
                        <Pressable key={f.id} testID={`tables-import-column-${i}-field-${f.id}`} onPress={() => set(`field:${f.id}`)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t("tables.import.into", { column: f.name })} style={pill(on)}>
                          <Text variant="caption" tone={on ? "onAccent" : "default"}>
                            {f.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {canManage
                      ? IMPORT_TYPES.map((type: ImportType) => {
                          const on = target === `new:${type}`;
                          return (
                            <Pressable key={type} testID={`tables-import-column-${i}-new-${type}`} onPress={() => set(`new:${type}`)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t("tables.import.newOf", { type: t(`fields.types.${type}`) })} style={pill(on)}>
                              <Text variant="caption" tone={on ? "onAccent" : "default"}>
                                {t("tables.import.newOf", { type: t(`fields.types.${type}`) })}
                              </Text>
                            </Pressable>
                          );
                        })
                      : null}
                  </ScrollView>
                  {refused && refused.count > 0 ? (
                    <Text tone="danger" variant="caption" testID={`tables-import-column-${i}-refused`}>
                      {t("tables.import.wouldRefuse", { count: refused.count, first: refused.first ?? "" })}
                    </Text>
                  ) : null}
                </View>
              );
            })}
            {step.targets.some((x) => x.startsWith("field:")) ? (
              <>
                <Text variant="label">{t("tables.import.upsertTitle")}</Text>
                <Text tone="muted" variant="caption">
                  {t("tables.import.upsertHint")}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
                  <Pressable testID="tables-import-upsert-none" onPress={() => setStep({ ...step, upsert: null })} accessibilityRole="radio" accessibilityState={{ selected: step.upsert === null }} accessibilityLabel={t("tables.import.upsertNone")} style={pill(step.upsert === null)}>
                    <Text variant="caption" tone={step.upsert === null ? "onAccent" : "default"}>
                      {t("tables.import.upsertNone")}
                    </Text>
                  </Pressable>
                  {step.targets
                    .filter((x): x is `field:${number}` => x.startsWith("field:"))
                    .map((x) => {
                      const fid = Number(x.slice(6));
                      const on = step.upsert === fid;
                      const name = fields.find((f) => f.id === fid)?.name ?? "";
                      return (
                        <Pressable key={x} testID={`tables-import-upsert-${fid}`} onPress={() => setStep({ ...step, upsert: fid })} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t("tables.import.upsertOn", { column: name })} style={pill(on)}>
                          <Text variant="caption" tone={on ? "onAccent" : "default"}>
                            {name}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>
              </>
            ) : null}
            <SheetButton testID="tables-import-start" label={t("tables.import.start", { count: step.sheet.rowCount })} disabled={busy || step.targets.every((x) => x === "skip")} busy={busy} onPress={() => void start()} />
          </>
        ) : null}

        {message ? (
          <Text tone="danger" testID="tables-import-message" accessibilityLiveRegion="polite">
            {message}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
