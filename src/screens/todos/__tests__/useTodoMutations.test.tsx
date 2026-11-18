/**
 * Every optimistic Todo write, both ways (`docs/DATA_LAYER.md` rule 3): the
 * open list and the lists' cards change before the server answers, and a
 * refusal puts both back. The server's answer is held with a gate, so
 * "before it answers" is a real moment in the test.
 */
import MockAdapter from "axios-mock-adapter";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { http } from "@/api/http";
import { todoKeys } from "@/api/keys";
import type { Todo, TodoGroup, TodoGroupsPage } from "@/api/todos";
import { testQueryClient } from "@/__tests__/queryClient";
import {
  useAddTask,
  useClearCompleted,
  useDeleteList,
  useDeleteTask,
  useMoveTask,
  useRenameList,
  useResetList,
  useToggleTask,
  useUndoDeleteTask,
  useUpdateTask,
} from "../useTodoMutations";

const BASE = "/api/v1/todo_app";
let mock: MockAdapter;
let client: QueryClient;

const task = (id: number, over: Partial<Todo> = {}): Todo => ({
  id, todoGroupId: 4, title: `T${id}`, notes: null, completed: false, position: id, dueDate: null, priority: "none", overdue: false, remindAt: null, remindSupported: false, createdAt: "", ...over,
});
const list = (id: number, todos: Todo[]): TodoGroup => ({
  id, name: `L${id}`, todosCount: todos.length, completedCount: todos.filter((t) => t.completed).length,
  pendingCount: todos.filter((t) => !t.completed).length, overdueCount: 0, previewTodos: todos.filter((t) => !t.completed).slice(0, 3), todos: [], updatedAt: "",
});
const serverTodo = (id: number, over: Record<string, unknown> = {}) => ({
  id, todo_group_id: 4, title: `T${id}`, notes: null, completed: false, position: id, due_date: null, priority: "none", overdue: false, ...over,
});

function gated(status: number, body: unknown = {}) {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  return { open, reply: async () => (await opened, [status, body] as [number, unknown]) };
}
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  mock = new MockAdapter(http);
  // Refetches after settle are answered by nothing: a 404 keeps the cache as written.
  client = testQueryClient({ queries: { gcTime: Infinity, retry: false, staleTime: Infinity }, mutations: { gcTime: Infinity } });
  const tasks = [task(1), task(2), task(3, { completed: true })];
  client.setQueryData<TodoGroup>(todoKeys.group(4), { ...list(4, tasks), todos: tasks });
  client.setQueryData<InfiniteData<TodoGroupsPage>>(todoKeys.listSearch(""), {
    pages: [{ rows: [list(4, tasks), list(5, [])], unreadable: 0, page: 1, pages: 1 }],
    pageParams: [1],
  });
});
afterEach(() => {
  mock.restore();
  client.clear();
});

const open = () => client.getQueryData<TodoGroup>(todoKeys.group(4))!;
const card = (id = 4) => client.getQueryData<InfiniteData<TodoGroupsPage>>(todoKeys.listSearch(""))!.pages[0].rows.find((g) => g.id === id);

describe("toggle a task", () => {
  it("ticks it in the open list and on the card at once", async () => {
    const g = gated(200, { todo: serverTodo(1, { completed: true }) });
    mock.onPut(`${BASE}/todos/1/toggle`).reply(g.reply);
    const { result } = renderHook(() => useToggleTask(4), { wrapper });
    act(() => result.current.mutate(task(1)));
    await waitFor(() => expect(open().todos[0].completed).toBe(true));
    expect(card()!.completedCount).toBe(2);
    expect(card()!.previewTodos.map((t) => t.id)).toEqual([2]);
    g.open();
  });

  it("a refusal unticks it again", async () => {
    mock.onPut(`${BASE}/todos/1/toggle`).reply(500);
    const onError = jest.fn();
    const { result } = renderHook(() => useToggleTask(4, { onError }), { wrapper });
    act(() => result.current.mutate(task(1)));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(open().todos[0].completed).toBe(false);
    expect(card()!.completedCount).toBe(1);
  });
});

describe("add a task", () => {
  it("shows at the end of the list at once, then takes the server's id", async () => {
    const g = gated(201, { todo: serverTodo(9, { title: "Eggs", position: 4, due_date: "2026-11-17", priority: "high" }) });
    let sent: unknown;
    mock.onPost(`${BASE}/todos`).reply((cfg) => {
      sent = JSON.parse(cfg.data);
      return g.reply();
    });
    const { result } = renderHook(() => useAddTask(4), { wrapper });
    act(() => result.current.mutate({ title: "Eggs", dueDate: "2026-11-17", priority: "high" }));
    await waitFor(() => expect(open().todos.map((t) => t.title)).toEqual(["T1", "T2", "T3", "Eggs"]));
    expect(open().todos[3]).toMatchObject({ dueDate: "2026-11-17", priority: "high" });
    expect(open().todos[3].id).toBeLessThan(0);
    await waitFor(() => expect(sent).toEqual({ todo_group_id: 4, todo: { title: "Eggs", due_date: "2026-11-17", priority: "high" } }));
    expect(card()!.todosCount).toBe(4);
    g.open();
    await waitFor(() => expect(open().todos[3].id).toBe(9));
  });

  it("a refusal takes it out again and gives the title back", async () => {
    mock.onPost(`${BASE}/todos`).reply(422, { errors: ["Title can't be blank"] });
    const onError = jest.fn();
    const { result } = renderHook(() => useAddTask(4, { onError }), { wrapper });
    act(() => result.current.mutate({ title: "Eggs" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.anything(), "Eggs"));
    expect(open().todos).toHaveLength(3);
    expect(card()!.todosCount).toBe(3);
  });
});

describe("edit a task", () => {
  it("writes the new title, priority and date at once, and rolls back on refusal", async () => {
    const g = gated(500);
    mock.onPut(`${BASE}/todos/2`).reply(g.reply);
    const { result } = renderHook(() => useUpdateTask(4), { wrapper });
    act(() => result.current.mutate({ todo: task(2), input: { title: "New", priority: "high", dueDate: "2026-11-20" } }));
    await waitFor(() => expect(open().todos[1]).toMatchObject({ title: "New", priority: "high", dueDate: "2026-11-20" }));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(open().todos[1]).toMatchObject({ title: "T2", priority: "none", dueDate: null });
  });
});

describe("delete a task", () => {
  it("gone at once, back on refusal", async () => {
    const g = gated(500);
    mock.onDelete(`${BASE}/todos/2`).reply(g.reply);
    const { result } = renderHook(() => useDeleteTask(4), { wrapper });
    act(() => result.current.mutate(task(2)));
    await waitFor(() => expect(open().todos.map((t) => t.id)).toEqual([1, 3]));
    expect(card()!.todosCount).toBe(2);
    g.open();
    await waitFor(() => expect(open().todos.map((t) => t.id)).toEqual([1, 2, 3]));
  });
});

describe("move a task", () => {
  it("sends the new order and shows it at once; a refusal restores the old one", async () => {
    let sent: unknown;
    const g = gated(500);
    mock.onPut(`${BASE}/todos/reorder`).reply((cfg) => {
      sent = JSON.parse(cfg.data);
      return g.reply();
    });
    const { result } = renderHook(() => useMoveTask(4), { wrapper });
    act(() => result.current.mutate({ todoId: 2, by: -1 }));
    await waitFor(() => expect(open().todos.map((t) => t.id)).toEqual([2, 1, 3]));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(sent).toEqual({ todo_group_id: 4, todo_ids: [2, 1, 3] });
    expect(open().todos.map((t) => t.id)).toEqual([1, 2, 3]);
  });
});

describe("the list's own actions", () => {
  it("rename shows at once on the open list and its card", async () => {
    const g = gated(500);
    mock.onPut(`${BASE}/todo_groups/4`).reply(g.reply);
    const { result } = renderHook(() => useRenameList(4), { wrapper });
    act(() => result.current.mutate("Shop"));
    await waitFor(() => expect(open().name).toBe("Shop"));
    expect(card()!.name).toBe("Shop");
    g.open();
    await waitFor(() => expect(open().name).toBe("L4"));
    expect(card()!.name).toBe("L4");
  });

  it("clear completed drops the ticked tasks at once", async () => {
    const g = gated(500);
    mock.onDelete(`${BASE}/todo_groups/4/clear_completed`).reply(g.reply);
    const { result } = renderHook(() => useClearCompleted(4), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(open().todos.map((t) => t.id)).toEqual([1, 2]));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(open().todos.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("reset unticks every task at once", async () => {
    const g = gated(200, { todo_group: { id: 4, name: "L4", todos: [serverTodo(1), serverTodo(2), serverTodo(3)] } });
    mock.onPost(`${BASE}/todo_groups/4/reset`).reply(g.reply);
    const { result } = renderHook(() => useResetList(4), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(open().todos.every((t) => !t.completed)).toBe(true));
    expect(card()!.completedCount).toBe(0);
    g.open();
  });

  it("delete takes the card out of the lists at once, and puts it back on refusal", async () => {
    const g = gated(500);
    mock.onDelete(`${BASE}/todo_groups/4`).reply(g.reply);
    const { result } = renderHook(() => useDeleteList(4), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(card(4)).toBeUndefined());
    expect(card(5)).toBeDefined();
    g.open();
    await waitFor(() => expect(card(4)).toBeDefined());
  });
});

describe("the Today / Upcoming / Overdue view", () => {
  it("a task ticked there leaves it at once, and comes back on refusal", async () => {
    client.setQueryData<Todo[]>(todoKeys.pending(), [task(1, { dueDate: "2026-11-16" }), task(7, { todoGroupId: 5 })]);
    const g = gated(500);
    mock.onPut(`${BASE}/todos/1/toggle`).reply(g.reply);
    const { result } = renderHook(() => useToggleTask(4), { wrapper });
    act(() => result.current.mutate(task(1)));
    await waitFor(() => expect(client.getQueryData<Todo[]>(todoKeys.pending())!.map((t) => t.id)).toEqual([7]));
    g.open();
    await waitFor(() => expect(client.getQueryData<Todo[]>(todoKeys.pending())!.map((t) => t.id)).toEqual([1, 7]));
  });

  it("a new date shows there at once", async () => {
    client.setQueryData<Todo[]>(todoKeys.pending(), [task(2)]);
    const g = gated(200, { todo: serverTodo(2, { due_date: "2026-12-01" }) });
    mock.onPut(`${BASE}/todos/2`).reply(g.reply);
    const { result } = renderHook(() => useUpdateTask(4), { wrapper });
    act(() => result.current.mutate({ todo: task(2), input: { dueDate: "2026-12-01" } }));
    await waitFor(() => expect(client.getQueryData<Todo[]>(todoKeys.pending())![0].dueDate).toBe("2026-12-01"));
    g.open();
  });
});

describe("undo a delete", () => {
  it("puts the task back where it was at once, re-creates it with every field, then restores its place", async () => {
    // The task is gone from the list (the delete already settled).
    client.setQueryData<TodoGroup>(todoKeys.group(4), { ...open(), todos: [task(1), task(3, { completed: true })] });
    const gone = task(2, { notes: "n", dueDate: "2026-11-20", priority: "high" });
    const posted: unknown[] = [];
    const g = gated(201, { todo: serverTodo(20, { title: "T2", notes: "n", due_date: "2026-11-20", priority: "high", position: 3 }) });
    mock.onPost(`${BASE}/todos`).reply((cfg) => {
      posted.push(JSON.parse(cfg.data));
      return g.reply();
    });
    let order: unknown;
    mock.onPut(`${BASE}/todos/reorder`).reply((cfg) => {
      order = JSON.parse(cfg.data);
      return [200, {}];
    });
    const { result } = renderHook(() => useUndoDeleteTask(4), { wrapper });
    act(() => result.current.mutate({ todo: gone, index: 1 }));
    await waitFor(() => expect(open().todos.map((t) => t.title)).toEqual(["T1", "T2", "T3"]));
    g.open();
    await waitFor(() => expect(order).toEqual({ todo_group_id: 4, todo_ids: [1, 20, 3] }));
    expect(posted).toEqual([{ todo_group_id: 4, todo: { title: "T2", notes: "n", due_date: "2026-11-20", priority: "high" } }]);
    expect(open().todos.map((t) => t.id)).toEqual([1, 20, 3]);
  });
});
