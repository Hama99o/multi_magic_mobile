/**
 * One form, and the way every builder tab changes it (increment 8): a change
 * is saved at once (the web's builder saves as you go), the screen shows the
 * server's answer, and a refusal is said, keeping what the person typed.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { tableFormsApi, type FormChanges, type TableForm } from "@/api/tableForms";
import { failureMessage } from "@/api/failure";

export function useFormEdit(formId: number, failed: string) {
  const client = useQueryClient();
  const form = useQuery({ queryKey: tablesKeys.form(formId), queryFn: () => tableFormsApi.show(formId), enabled: Number.isFinite(formId) });
  const [error, setError] = useState<string | null>(null);
  const put = (next: TableForm) => {
    client.setQueryData(tablesKeys.form(formId), next);
    void client.invalidateQueries({ queryKey: tablesKeys.forms(next.tableId) });
  };
  const save = useMutation({
    mutationFn: (changes: FormChanges) => tableFormsApi.update(formId, changes),
    onMutate: () => setError(null),
    onSuccess: put,
    onError: (e) => setError(failureMessage(e, failed)),
  });
  /** Any call that answers the form (cover, invites): its answer shown, its refusal said. */
  const run = async (work: () => Promise<TableForm>) => {
    setError(null);
    try {
      put(await work());
      return true;
    } catch (e) {
      setError(failureMessage(e, failed));
      return false;
    }
  };
  return { form, save: (c: FormChanges) => save.mutate(c), saving: save.isPending, run, error, setError };
}
