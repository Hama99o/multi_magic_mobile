/**
 * The Todo app — `docs/design/todos/SPEC.md`.
 *
 * Every call the web's `pages/todos/api/todos.api.ts` makes, against
 * `Api::V1::TodoApp::{TodoGroups,Todos,Templates}Controller`, read 2026-11-16
 * at multi_magic 0986d1e4. Request bodies use the SERVER's names
 * (`todo_group_params`, `todo_params`, `template_params`), because nothing
 * here converts case.
 *
 * ── ORDER ────────────────────────────────────────────────────────────────
 * Lists come in the server's order, `updated_at desc`, 20 a page: the list
 * just made or just touched is on top of page 1. The tasks inside a list come
 * by `position` (the person's own order, reorderable, as on the web); a new
 * task goes to the end (`acts_as_list`).
 *
 * ── THE LIST ID IS BESIDE THE TODO, NEVER INSIDE IT ───────────────────────
 * `todo_params` refuses `todo_group_id` on purpose (an update could move a
 * task into someone else's list); create reads it from the top level.
 */
import { http } from "./http";
import { arr, bool, id, obj, optStr, readableRows, str } from "./parse";

const BASE = "/api/v1/todo_app";

export type TodoPriority = "none" | "low" | "medium" | "high";
export const TODO_PRIORITIES: readonly TodoPriority[] = ["none", "low", "medium", "high"];
export type TodoFrequency = "none" | "daily" | "weekly" | "monthly";
export const TODO_FREQUENCIES: readonly TodoFrequency[] = ["none", "daily", "weekly", "monthly"];

export interface Todo {
  id: number;
  todoGroupId: number;
  title: string;
  notes: string | null;
  completed: boolean;
  position: number;
  /** `YYYY-MM-DD`. */
  dueDate: string | null;
  priority: TodoPriority;
  /** Pending and past its due date (the server's `overdue?`). */
  overdue: boolean;
  createdAt: string;
}

export interface TodoGroup {
  id: number;
  name: string;
  todosCount: number;
  completedCount: number;
  pendingCount: number;
  overdueCount: number;
  /** Up to 3 pending tasks (the list's index view); [] from show. */
  previewTodos: Todo[];
  /** Every active task, by position (show and the list actions); [] from the index. */
  todos: Todo[];
  updatedAt: string;
}

export interface TodoGroupsPage {
  rows: TodoGroup[];
  unreadable: number;
  page: number;
  pages: number;
}

export interface TodoTemplateItem {
  title: string;
  notes?: string | null;
}

export interface TodoTemplate {
  id: number;
  name: string;
  items: TodoTemplateItem[];
  itemsCount: number;
  frequency: TodoFrequency;
  intervalCount: number;
  nextOccurrenceOn: string | null;
}

export interface TodoInput {
  title?: string;
  notes?: string | null;
  dueDate?: string | null;
  priority?: TodoPriority;
}

export interface TemplateInput {
  name: string;
  items: TodoTemplateItem[];
  frequency: TodoFrequency;
  intervalCount: number;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const count = (v: unknown) => (typeof v === "number" ? v : 0);

function parseTodo(raw: unknown): Todo {
  const t = obj(raw, "todo");
  return {
    id: id(t.id, "todo.id"),
    todoGroupId: id(t.todo_group_id, "todo.todo_group_id"),
    title: str(t.title, "todo.title"),
    notes: optStr(t.notes) || null,
    completed: bool(t.completed, "todo.completed"),
    position: count(t.position),
    dueDate: optStr(t.due_date),
    priority: oneOf(t.priority, TODO_PRIORITIES, "none"),
    overdue: t.overdue === true,
    createdAt: optStr(t.created_at) ?? "",
  };
}

function parseGroup(raw: unknown): TodoGroup {
  const g = obj(raw, "todo_group");
  const tasks = (v: unknown) => (Array.isArray(v) ? readableRows(v, parseTodo).rows : []);
  return {
    id: id(g.id, "todo_group.id"),
    name: str(g.name, "todo_group.name"),
    todosCount: count(g.todos_count),
    completedCount: count(g.completed_count),
    pendingCount: count(g.pending_count),
    overdueCount: count(g.overdue_count),
    previewTodos: tasks(g.preview_todos),
    todos: tasks(g.todos),
    updatedAt: optStr(g.updated_at) ?? "",
  };
}

function parseTemplate(raw: unknown): TodoTemplate {
  const t = obj(raw, "template");
  const items = Array.isArray(t.items)
    ? t.items.flatMap((i) => {
        const item = i as Record<string, unknown> | null;
        const title = typeof item?.title === "string" ? item.title : "";
        return title ? [{ title, notes: optStr(item?.notes) }] : [];
      })
    : [];
  return {
    id: id(t.id, "template.id"),
    name: str(t.name, "template.name"),
    items,
    itemsCount: typeof t.items_count === "number" ? t.items_count : items.length,
    frequency: oneOf(t.frequency, TODO_FREQUENCIES, "none"),
    intervalCount: typeof t.interval_count === "number" && t.interval_count > 0 ? t.interval_count : 1,
    nextOccurrenceOn: optStr(t.next_occurrence_on),
  };
}

function todoBody(input: TodoInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.notes !== undefined) body.notes = input.notes;
  if (input.dueDate !== undefined) body.due_date = input.dueDate;
  if (input.priority !== undefined) body.priority = input.priority;
  return body;
}

const templateBody = (input: TemplateInput) => ({
  template: { name: input.name, items: input.items, frequency: input.frequency, interval_count: input.intervalCount },
});

const group = (data: unknown, where: string) => parseGroup(obj(data, where).todo_group);

export const todoGroupsApi = {
  list: async ({ page, search }: { page: number; search?: string }): Promise<TodoGroupsPage> => {
    const term = search?.trim();
    const res = await http.get(`${BASE}/todo_groups`, { params: term ? { page, search: term } : { page } });
    const body = obj(res.data, "todo_groups");
    const { rows, unreadable } = readableRows(arr(body.todo_groups, "todo_groups"), parseGroup);
    const pagy = ((body.meta ?? {}) as { pagy?: { page?: unknown; pages?: unknown } }).pagy ?? {};
    return {
      rows,
      unreadable,
      page: typeof pagy.page === "number" ? pagy.page : page,
      pages: typeof pagy.pages === "number" ? pagy.pages : 1,
    };
  },

  show: async (groupId: number): Promise<TodoGroup> => group((await http.get(`${BASE}/todo_groups/${groupId}`)).data, "show"),

  create: async (name: string): Promise<TodoGroup> =>
    group((await http.post(`${BASE}/todo_groups`, { todo_group: { name } })).data, "create"),

  rename: async (groupId: number, name: string): Promise<TodoGroup> =>
    group((await http.put(`${BASE}/todo_groups/${groupId}`, { todo_group: { name } })).data, "rename"),

  remove: async (groupId: number): Promise<void> => {
    await http.delete(`${BASE}/todo_groups/${groupId}`);
  },

  clearCompleted: async (groupId: number): Promise<TodoGroup> =>
    group((await http.delete(`${BASE}/todo_groups/${groupId}/clear_completed`)).data, "clear_completed"),

  reset: async (groupId: number): Promise<TodoGroup> =>
    group((await http.post(`${BASE}/todo_groups/${groupId}/reset`)).data, "reset"),

  duplicate: async (groupId: number): Promise<TodoGroup> =>
    group((await http.post(`${BASE}/todo_groups/${groupId}/duplicate`)).data, "duplicate"),

  saveAsTemplate: async (groupId: number): Promise<TodoTemplate> =>
    parseTemplate(obj((await http.post(`${BASE}/todo_groups/${groupId}/save_as_template`, {})).data, "save_as_template").template),
};

export const todosApi = {
  create: async (groupId: number, input: TodoInput): Promise<Todo> =>
    parseTodo(obj((await http.post(`${BASE}/todos`, { todo_group_id: groupId, todo: todoBody(input) })).data, "create").todo),

  update: async (todoId: number, input: TodoInput): Promise<Todo> =>
    parseTodo(obj((await http.put(`${BASE}/todos/${todoId}`, { todo: todoBody(input) })).data, "update").todo),

  toggle: async (todoId: number): Promise<Todo> =>
    parseTodo(obj((await http.put(`${BASE}/todos/${todoId}/toggle`)).data, "toggle").todo),

  remove: async (todoId: number): Promise<void> => {
    await http.delete(`${BASE}/todos/${todoId}`);
  },

  reorder: async (groupId: number, todoIds: number[]): Promise<void> => {
    await http.put(`${BASE}/todos/reorder`, { todo_group_id: groupId, todo_ids: todoIds });
  },
};

export const todoTemplatesApi = {
  list: async (): Promise<TodoTemplate[]> =>
    readableRows(arr(obj((await http.get(`${BASE}/templates`)).data, "templates").templates, "templates"), parseTemplate).rows,

  create: async (input: TemplateInput): Promise<TodoTemplate> =>
    parseTemplate(obj((await http.post(`${BASE}/templates`, templateBody(input))).data, "create").template),

  update: async (templateId: number, input: TemplateInput): Promise<TodoTemplate> =>
    parseTemplate(obj((await http.put(`${BASE}/templates/${templateId}`, templateBody(input))).data, "update").template),

  remove: async (templateId: number): Promise<void> => {
    await http.delete(`${BASE}/templates/${templateId}`);
  },

  /** A new list from the template's items. */
  apply: async (templateId: number): Promise<TodoGroup> =>
    group((await http.post(`${BASE}/templates/${templateId}/apply`, {})).data, "apply"),
};

export const __parse = { parseTodo, parseGroup, parseTemplate };
