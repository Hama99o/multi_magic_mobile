/**
 * TABLES: ONE FORM'S BUILDER (increment 8; the web's `FormBuilder.tsx`), in
 * four tabs: Questions, Page, Share, Answers (`FormTabs.tsx`). Every change
 * saves at once (`useFormEdit`). Delete asks first and says the answers
 * already in the table stay.
 */
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { tableFormsApi } from "@/api/tableForms";
import { failureMessage } from "@/api/failure";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { KeyboardPadding } from "@/components/KeyboardPadding";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { useMetrics } from "@/hooks/useColors";
import { Segmented } from "@/screens/flow/parts";
import { AnswersTab, PageTab, QuestionsTab, ShareTab } from "@/screens/tables/FormTabs";
import { useFormEdit } from "@/screens/tables/useFormEdit";

type Tab = "questions" | "page" | "share" | "answers";

export default function FormScreen() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const params = useLocalSearchParams<{ id: string; table: string }>();
  const formId = Number(params.id);
  const { form, save, run, error, setError } = useFormEdit(formId, t("tables.form.saveFailed"));
  const [tab, setTab] = useState<Tab>("questions");

  const remove = () =>
    Alert.alert(t("tables.form.deleteTitle", { name: form.data?.name ?? "" }), t("tables.form.deleteBody"), [
      { text: t("fields.cancel"), style: "cancel" },
      {
        text: t("tables.form.delete"),
        style: "destructive",
        onPress: () =>
          void tableFormsApi
            .destroy(formId)
            .then(async () => {
              if (form.data) await client.invalidateQueries({ queryKey: tablesKeys.forms(form.data.tableId) });
              router.back();
            })
            .catch((e: unknown) => setError(failureMessage(e, t("tables.form.saveFailed")))),
      },
    ]);

  return (
    <Screen measure>
      <AppHeader app="tables" back title={form.data?.name ?? t("tables.forms.title")} />
      <View style={{ paddingVertical: metrics.space.xs }}>
        <Segmented
          testID="tables-form-tabs"
          value={tab}
          onChange={setTab}
          options={[
            { value: "questions", label: t("tables.form.tabs.questions") },
            { value: "page", label: t("tables.form.tabs.page") },
            { value: "share", label: t("tables.form.tabs.share") },
            { value: "answers", label: t("tables.form.tabs.answers") },
          ]}
        />
      </View>
      <LoadFailure error={form.error} loadFailed={t("tables.forms.loadFailed")} hasData={Boolean(form.data)} updatedAt={form.dataUpdatedAt} onRetry={() => void form.refetch()} testID="tables-form-failed" />
      {error ? (
        <Text tone="danger" testID="tables-form-error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <KeyboardPadding>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: metrics.space.xl }}>
          {form.isPending ? <RowsSkeleton rows={4} testID="tables-form-loading" /> : null}
          {form.data && tab === "questions" ? <QuestionsTab form={form.data} save={save} /> : null}
          {form.data && tab === "page" ? <PageTab form={form.data} save={save} run={run} onDelete={remove} /> : null}
          {form.data && tab === "share" ? <ShareTab form={form.data} save={save} run={run} /> : null}
          {form.data && tab === "answers" ? <AnswersTab form={form.data} /> : null}
        </ScrollView>
      </KeyboardPadding>
    </Screen>
  );
}
