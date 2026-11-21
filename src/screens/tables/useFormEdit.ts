/**
 * One form, and the way every builder tab changes it (increment 8): a change
 * is saved at once (the web's builder saves as you go), the screen shows the
 * server's answer, and a refusal is said, keeping what the person typed.
 *
 * Saves go one at a time, in order, and a change given as a function is built
 * when its turn comes, from the form the previous save returned. The questions
 * are saved as a whole array: built from the screen's copy, a second rename
 * sent before the first one's answer overwrote it (ee's review, M3).
 */
import { useRef, useState } from "react";
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
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = (change: FormChanges | ((current: TableForm) => FormChanges)) => {
    queue.current = queue.current.then(() => {
      const current = client.getQueryData<TableForm>(tablesKeys.form(formId));
      if (typeof change === "function" && !current) return;
      // A refusal is said by `onError`; the queue only needs to move on.
      return save.mutateAsync(typeof change === "function" ? change(current as TableForm) : change).catch(() => undefined);
    });
  };
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
  return { form, save: enqueue, saving: save.isPending, run, error, setError };
}
