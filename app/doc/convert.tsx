/**
 * CONVERT (SPEC §C.9; web `ConverterDoc.tsx`).
 *
 * The formats offered are what the file is NOT: a picture → PDF / JPG / PNG /
 * WebP minus its own; a PDF → JPG / PNG. The result keeps the original's
 * name. A PDF of several pages becomes one picture per page (asked page by
 * page up to DOC_PER_PAGE_LIMIT, so they can go into the gallery; one zip
 * past that).
 */
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DOC_PER_PAGE_LIMIT, baseName, docApi, type DocFile, type DocResult } from "@/api/doc";
import { RefreshCw } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/reusables/button";
import { Text } from "@/components/reusables/text";
import { useMetrics } from "@/hooks/useColors";
import { convertTargets, kindOf, needsServerPreview, type ConvertTarget } from "@/screens/doc/files";
import { Chip, SectionLabel } from "@/screens/doc/controls";
import { BusyCard, ErrorLine, FileRow, IntakeCard, ResultSheet, useDocTask, useIntake, useRetry } from "@/screens/doc/ui";
import { inspectionProblem, useInspect } from "@/screens/doc/pdf";

const FORMAT_LABEL: Record<ConvertTarget, string> = {
  pdf: "doc.convert.formats.pdf",
  jpg: "doc.convert.formats.jpg",
  png: "doc.convert.formats.png",
  webp: "doc.convert.formats.webp",
};

export default function ConvertScreen() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [file, setFile] = useState<DocFile | null>(null);
  const [target, setTarget] = useState<ConvertTarget | null>(null);
  const [results, setResults] = useState<DocResult[] | null>(null);
  const task = useDocTask();
  const { remember, retry } = useRetry();
  const intake = useIntake("any", false, (files) => {
    setFile(files[0]);
    setTarget(null);
    task.clearError();
  });
  const kind = file ? kindOf(file) : null;
  const inspect = useInspect(kind === "pdf" ? file : null);
  const problem = inspectionProblem(inspect.data) ?? inspect.error ?? null;
  const pages = inspect.data?.pages ?? 0;
  const targets = file ? convertTargets(file) : [];

  const convert = remember("convert", async () => {
    if (!file || !target) return;
    const base = baseName(file.name);
    const out = await task.run(async (opts): Promise<DocResult[]> => {
      if (kind === "image") return [await docApi.convertImage(file, target, { ...opts, as: `${base}.${target}` })];
      const to = target === "png" ? "png" : "jpg";
      if (pages <= 1) return [(await docApi.pdfToImages(file, to, 0, { ...opts, as: `${base}.${to}` })).result];
      if (pages > DOC_PER_PAGE_LIMIT) return [(await docApi.pdfToImages(file, to, undefined, opts)).result];
      const files: DocResult[] = [];
      for (let p = 0; p < pages; p++) {
        opts.step(p + 1, pages);
        files.push((await docApi.pdfToImages(file, to, p, opts)).result);
      }
      return files;
    });
    if (out) setResults(out);
  });

  return (
    <Screen measure header={<AppHeader app="doc" title={t("doc.tools.convert.title")} back />}>
      <ScrollView contentContainerStyle={{ gap: metrics.space.md, paddingVertical: metrics.space.md }}>
        {!file ? (
          <IntakeCard testID="doc-convert-intake" icon={RefreshCw} help={t("doc.convert.help")} limits={t("doc.intake.anyFile")} onAdd={intake.openSheet} />
        ) : (
          <>
            <FileRow
              file={file}
              note={kind === "pdf" ? (inspect.data ? t("doc.file.pages", { count: pages }) : t("doc.file.checking")) : needsServerPreview(file) ? t("doc.convert.serverPrepared") : null}
              onClear={() => setFile(null)}
            />
            <ErrorLine error={problem} name={file.name} onRetry={() => void inspect.refetch()} />
            {!problem && (kind === "image" || inspect.data) ? (
              <>
                <SectionLabel>{t("doc.convert.to")}</SectionLabel>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }} testID="doc-convert-targets">
                  {targets.map((k) => (
                    <Chip key={k} testID={`doc-convert-to-${k}`} label={t(FORMAT_LABEL[k])} selected={target === k} onPress={() => setTarget(k)} />
                  ))}
                </View>
                {!target ? <Text tone="muted">{t("doc.convert.pickFormat")}</Text> : null}
                {kind === "pdf" && pages > DOC_PER_PAGE_LIMIT ? (
                  <Text tone="muted" variant="caption">
                    {t("doc.convert.zipNote", { count: DOC_PER_PAGE_LIMIT })}
                  </Text>
                ) : null}
                <BusyCard task={task} />
                <ErrorLine error={task.error} name={file.name} onDismiss={task.clearError} onRetry={() => retry({ convert })} />
                <Button testID="doc-convert-go" label={t("doc.convert.convert")} disabled={!target || task.busy} onPress={() => void convert()} />
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      {intake.sheet}
      <ResultSheet results={results} onClose={() => setResults(null)} />
    </Screen>
  );
}
