/**
 * The Todo writes the person sees at once, OPTIMISTIC (`docs/DATA_LAYER.md`
 * rule 3): the open list (`todoKeys.group`) and its card on the lists screen
 * (`todoKeys.lists`) change before the server answers, a refusal puts both
 * back, and every key the write touched is refetched after.
 *
 * The card's counts and its 3-task preview are RECOUNTED from the open list
 * when that is in the cache, so the two can never disagree; ticking a task
 * straight from a card (no list open) adjusts the card alone.
 *
 * Not optimistic, on purpose: duplicate, save as template and apply a
 * template. Each makes a record whose id and name the server decides
 * ("Groceries (Copy)"); a guess would flash a wrong name.
 */
import { useMutation, useQueryClient, type InfiniteData, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { todoKeys } from "@/api/keys";
import { todoGroupsApi, todosApi, todoTemplatesApi, type TemplateInput, type TodoTemplate, type Todo, type TodoGroup, type TodoGroupsPage, type TodoInput } from "@/api/todos";
import { todayKey } from "@/screens/calendar/dates";

type Snapshot = [QueryKey, unknown][];
type Opts = { onError?: (e: unknown) => void };

async function snapshot(client: QueryClient, prefixes: QueryKey[]): Promise<Snapshot> {
  await Promise.all(prefixes.map((queryKey) => client.cancelQueries({ queryKey })));
  return prefixes.flatMap((queryKey) => client.getQueriesData({ queryKey }));
}

/** Put a snapshot back, key by key (`exact`), so no shape can change. */
function restore(client: QueryClient, saved: Snapshot | undefined) {
  for (const [queryKey, data] of saved ?? []) client.setQueriesData({ queryKey, exact: true }, data);
}

const settle = (client: QueryClient, keys: QueryKey[]) => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));

/** A card's counts and preview, from the list's full set of tasks. */
export function recount(card: TodoGroup, todos: Todo[]): TodoGroup {
  const pending = todos.filter((t) => !t.completed);
  return {
    ...card,
    todosCount: todos.length,
    completedCount: todos.length - pending.length,
    pendingCount: pending.length,
    overdueCount: pending.filter((t) => t.overdue).length,
    previewTodos: pending.slice(0, 3),
  };
}

function editCards(client: QueryClient, edit: (rows: TodoGroup[]) => TodoGroup[]) {
  client.setQueriesData<InfiniteData<TodoGroupsPage>>({ queryKey: todoKeys.lists() }, (data) =>
    data?.pages ? { ...data, pages: data.pages.map((p) => ({ ...p, rows: edit(p.rows) })) } : data,
  );
}

/**
 * Change one list's tasks everywhere: the open list, and its card (recounted
 * from the new tasks, or by `cardFallback` when the list is not open).
 */
function patchTasks(client: QueryClient, groupId: number, edit: (todos: Todo[]) => Todo[], cardFallback?: (card: TodoGroup) => TodoGroup) {
  const before = client.getQueryData<TodoGroup>(todoKeys.group(groupId));
  const after = before ? edit(before.todos) : null;
  // The cross-list view holds this list's pending tasks among others': edit
  // them in place, and drop the ones now done or gone.
  client.setQueryData<Todo[]>(todoKeys.pending(), (rows) => {
    if (!rows) return rows;
    const edited = new Map(edit(rows.filter((t) => t.todoGroupId === groupId)).map((t) => [t.id, t]));
    return rows.flatMap((t) => {
      if (t.todoGroupId !== groupId) return [t];
      const next = edited.get(t.id);
      return next && !next.completed ? [next] : [];
    });
  });
  // Search results keep done tasks, ticked, and lose deleted ones.
  client.setQueriesData<Todo[]>({ queryKey: todoKeys.taskSearches() }, (rows) => {
    if (!rows) return rows;
    const edited = new Map(edit(rows.filter((t) => t.todoGroupId === groupId)).map((t) => [t.id, t]));
    return rows.flatMap((t) => (t.todoGroupId !== groupId ? [t] : edited.has(t.id) ? [edited.get(t.id)!] : []));
  });
  if (before && after) client.setQueryData<TodoGroup>(todoKeys.group(groupId), recount({ ...before, todos: after }, after));
  editCards(client, (rows) =>
    rows.map((card) => {
      if (card.id !== groupId) return card;
      if (after) return recount(card, after);
      return cardFallback ? cardFallback(card) : card;
    }),
  );
}

function patchName(client: QueryClient, groupId: number, name: string) {
  client.setQueryData<TodoGroup>(todoKeys.group(groupId), (old) => (old ? { ...old, name } : old));
  editCards(client, (rows) => rows.map((g) => (g.id === groupId ? { ...g, name } : g)));
}

const touched = (groupId: number): QueryKey[] => [todoKeys.group(groupId), todoKeys.lists(), todoKeys.pending(), todoKeys.taskSearches()];

/** Tick or untick. Callable from the open list or straight from a card's preview. */
export function useToggleTask(groupId: number, opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (todo: Todo) => todosApi.toggle(todo.id),
    onMutate: async (todo) => {
      const saved = await snapshot(client, touched(groupId));
      const completed = !todo.completed;
      patchTasks(
        client,
        groupId,
        (todos) => todos.map((t) => (t.id === todo.id ? { ...t, completed, overdue: completed ? false : t.overdue } : t)),
        (card) => ({
          ...card,
          completedCount: card.completedCount + (completed ? 1 : -1),
          pendingCount: card.pendingCount + (completed ? -1 : 1),
          previewTodos: completed ? card.previewTodos.filter((t) => t.id !== todo.id) : card.previewTodos,
        }),
      );
      return { saved };
    },
    onError: (e, _t, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, touched(groupId)),
  });
}

/** A new task, at the end (`acts_as_list`), shown before the server answers. */
export function useAddTask(groupId: number, opts: { onError?: (e: unknown, title: string) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TodoInput & { title: string }) => todosApi.create(groupId, input),
    onMutate: async ({ title, dueDate = null, priority = "none" }) => {
      const saved = await snapshot(client, touched(groupId));
      const tempId = -Date.now();
      patchTasks(
        client,
        groupId,
        (todos) => [...todos, { id: tempId, todoGroupId: groupId, title, notes: null, completed: false, position: todos.length + 1, dueDate, priority, overdue: dueDate != null && dueDate < todayKey(), remindAt: null, remindSupported: todos[0]?.remindSupported ?? false, createdAt: "" }],
        (card) => ({ ...card, todosCount: card.todosCount + 1, pendingCount: card.pendingCount + 1 }),
      );
      return { saved, tempId };
    },
    onSuccess: (todo, _input, ctx) => {
      patchTasks(client, groupId, (todos) => todos.map((t) => (t.id === ctx?.tempId ? todo : t)));
    },
    onError: (e, input, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e, input.title);
    },
    onSettled: () => settle(client, touched(groupId)),
  });
}

/** Title, notes, due date, priority. */
export function useUpdateTask(groupId: number, opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ todo, input }: { todo: Todo; input: TodoInput }) => todosApi.update(todo.id, input),
    onMutate: async ({ todo, input }) => {
      const saved = await snapshot(client, touched(groupId));
      patchTasks(client, groupId, (todos) =>
        todos.map((t) => {
          if (t.id !== todo.id) return t;
          const next = { ...t, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) } as Todo;
          return { ...next, overdue: !next.completed && next.dueDate != null && next.dueDate < todayKey() };
        }),
      );
      return { saved };
    },
    onError: (e, _v, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, touched(groupId)),
  });
}

export function useDeleteTask(groupId: number, opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (todo: Todo) => todosApi.remove(todo.id),
    onMutate: async (todo) => {
      const saved = await snapshot(client, touched(groupId));
      patchTasks(client, groupId, (todos) => todos.filter((t) => t.id !== todo.id));
      return { saved };
    },
    onError: (e, _t, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, touched(groupId)),
  });
}

/** One step up (-1) or down (+1) in the list's own order (the web drags; a phone row moves). */
export function useMoveTask(groupId: number, opts: Opts = {}) {
  const client = useQueryClient();
  const moved = (todos: Todo[], todoId: number, by: number) => {
    const from = todos.findIndex((t) => t.id === todoId);
    const to = from + by;
    if (from < 0 || to < 0 || to >= todos.length) return todos;
    const next = [...todos];
    const [t] = next.splice(from, 1);
    next.splice(to, 0, t);
    return next;
  };
  return useMutation({
    mutationFn: ({ todoId, by }: { todoId: number; by: number }) => {
      const todos = client.getQueryData<TodoGroup>(todoKeys.group(groupId))?.todos ?? [];
      return todosApi.reorder(groupId, todos.map((t) => t.id).filter((id) => id > 0));
    },
    onMutate: async ({ todoId, by }) => {
      const saved = await snapshot(client, touched(groupId));
      patchTasks(client, groupId, (todos) => moved(todos, todoId, by));
      return { saved };
    },
    onError: (e, _v, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, touched(groupId)),
  });
}

export function useRenameList(groupId: number, opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => todoGroupsApi.rename(groupId, name),
    onMutate: async (name) => {
      const saved = await snapshot(client, touched(groupId));
      patchName(client, groupId, name);
      return { saved };
    },
    onError: (e, _n, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, touched(groupId)),
  });
}

export function useClearCompleted(groupId: number, opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => todoGroupsApi.clearCompleted(groupId),
    onMutate: async () => {
      const saved = await snapshot(client, touched(groupId));
      patchTasks(client, groupId, (todos) => todos.filter((t) => !t.completed));
      return { saved };
    },
    onError: (e, _v, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, touched(groupId)),
  });
}

/** Untick everything, to use the list again (a weekly shop). */
export function useResetList(groupId: number, opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => todoGroupsApi.reset(groupId),
    onMutate: async () => {
      const saved = await snapshot(client, touched(groupId));
      patchTasks(client, groupId, (todos) => todos.map((t) => ({ ...t, completed: false, overdue: t.dueDate != null && t.dueDate < todayKey() })));
      return { saved };
    },
    onError: (e, _v, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, touched(groupId)),
  });
}

export function useDeleteList(groupId: number, opts: Opts & { onDone?: () => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => todoGroupsApi.remove(groupId),
    onMutate: async () => {
      const saved = await snapshot(client, [todoKeys.lists()]);
      editCards(client, (rows) => rows.filter((g) => g.id !== groupId));
      return { saved };
    },
    onSuccess: () => {
      client.removeQueries({ queryKey: todoKeys.group(groupId), exact: true });
      opts.onDone?.();
    },
    onError: (e, _v, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, [todoKeys.lists()]),
  });
}

/**
 * Undo a delete. The server's delete is hard (`@todo.destroy`), so the task is
 * made again with every field it had, ticked again if it was, and put back at
 * its old place. It shows there at once.
 */
export function useUndoDeleteTask(groupId: number, opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ todo }: { todo: Todo; index: number }) => {
      const made = await todosApi.create(groupId, {
        title: todo.title,
        ...(todo.notes ? { notes: todo.notes } : {}),
        ...(todo.dueDate ? { dueDate: todo.dueDate } : {}),
        ...(todo.priority !== "none" ? { priority: todo.priority } : {}),
        ...(todo.remindAt ? { remindAt: todo.remindAt } : {}),
      });
      return todo.completed ? todosApi.toggle(made.id) : made;
    },
    onMutate: async ({ todo, index }) => {
      const saved = await snapshot(client, touched(groupId));
      patchTasks(client, groupId, (todos) => [...todos.slice(0, index), { ...todo, id: -todo.id }, ...todos.slice(index)]);
      return { saved };
    },
    onSuccess: async (made, { todo }) => {
      patchTasks(client, groupId, (todos) => todos.map((t) => (t.id === -todo.id ? made : t)));
      const ids = client.getQueryData<TodoGroup>(todoKeys.group(groupId))?.todos.map((t) => t.id).filter((id) => id > 0);
      if (ids) await todosApi.reorder(groupId, ids);
    },
    onError: (e, _v, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, touched(groupId)),
  });
}

/**
 * Made by the server, so not optimistic: a new list, a copy ("… (Copy)"), a
 * list from a template. Each answers with the new list, which the caller opens.
 */
export function useCreateList(opts: Opts & { onDone?: (group: TodoGroup) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => todoGroupsApi.create(name),
    onSuccess: (group) => opts.onDone?.(group),
    onError: (e) => opts.onError?.(e),
    onSettled: () => settle(client, [todoKeys.lists()]),
  });
}

export function useDuplicateList(groupId: number, opts: Opts & { onDone?: (group: TodoGroup) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => todoGroupsApi.duplicate(groupId),
    onSuccess: (group) => opts.onDone?.(group),
    onError: (e) => opts.onError?.(e),
    onSettled: () => settle(client, [todoKeys.lists()]),
  });
}

export function useSaveAsTemplate(groupId: number, opts: Opts & { onDone?: () => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => todoGroupsApi.saveAsTemplate(groupId),
    onSuccess: () => opts.onDone?.(),
    onError: (e) => opts.onError?.(e),
    onSettled: () => settle(client, [todoKeys.templates()]),
  });
}

export function useApplyTemplate(opts: Opts & { onDone?: (group: TodoGroup) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (templateId: number) => todoTemplatesApi.apply(templateId),
    onSuccess: (group) => opts.onDone?.(group),
    onError: (e) => opts.onError?.(e),
    onSettled: () => settle(client, [todoKeys.lists()]),
  });
}

export function useSaveTemplate(opts: Opts & { onDone?: () => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: TemplateInput }) => (id == null ? todoTemplatesApi.create(input) : todoTemplatesApi.update(id, input)),
    onSuccess: () => opts.onDone?.(),
    onError: (e) => opts.onError?.(e),
    onSettled: () => settle(client, [todoKeys.templates()]),
  });
}

/** Gone from the templates at once; back on refusal. */
export function useDeleteTemplate(opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (templateId: number) => todoTemplatesApi.remove(templateId),
    onMutate: async (templateId) => {
      const saved = await snapshot(client, [todoKeys.templates()]);
      client.setQueryData<TodoTemplate[]>(todoKeys.templates(), (rows) => rows?.filter((r) => r.id !== templateId));
      return { saved };
    },
    onError: (e, _id, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, [todoKeys.templates()]),
  });
}

/** A whole new order, from a drag (the web's SortableJS `onEnd`). */
export function useReorderTasks(groupId: number, opts: Opts = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (order: number[]) => todosApi.reorder(groupId, order.filter((id) => id > 0)),
    onMutate: async (order) => {
      const saved = await snapshot(client, touched(groupId));
      patchTasks(client, groupId, (todos) => {
        const at = new Map(order.map((id, i) => [id, i]));
        return [...todos].sort((a, b) => (at.get(a.id) ?? Infinity) - (at.get(b.id) ?? Infinity));
      });
      return { saved };
    },
    onError: (e, _v, ctx) => {
      restore(client, ctx?.saved);
      opts.onError?.(e);
    },
    onSettled: () => settle(client, touched(groupId)),
  });
}
