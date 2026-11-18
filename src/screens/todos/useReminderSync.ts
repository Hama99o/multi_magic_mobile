/**
 * After a reminder is set, changed or cleared (or a task with one is ticked or
 * deleted), make this phone's schedule match: the pending tasks are read
 * fresh through the cache (`todoKeys.pending`), then `resyncTodoReminders`.
 * Setting a reminder asks for notification permission first, once.
 */
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { todoKeys } from "@/api/keys";
import { todosApi } from "@/api/todos";
import { ensureReminderPermission, resyncTodoReminders } from "@/screens/notes/reminderNotifications";

export function useReminderSync(): (opts?: { ask?: boolean }) => void {
  const client = useQueryClient();
  return useCallback(
    (opts = {}) => {
      void (async () => {
        if (opts.ask && !(await ensureReminderPermission())) return;
        const tasks = await client.fetchQuery({ queryKey: todoKeys.pending(), queryFn: todosApi.pending, staleTime: 0 });
        await resyncTodoReminders(tasks);
      })().catch(() => undefined);
    },
    [client],
  );
}
