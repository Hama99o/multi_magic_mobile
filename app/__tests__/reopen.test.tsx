/**
 * THE COLD START REOPENS THE LAST APP, NEVER HOME (CLAUDE.md "Reopening the
 * app"; MANIFEST M11–M13). The rules, one test each:
 *   - a last app → that app, at the screen saved, never Home;
 *   - a record re-opened only once fetched again; gone or offline → app root;
 *   - no last app (first launch) → Home; signed out → sign-in;
 *   - sign-out and another account clear it; a visit to Home keeps it;
 *   - a save from an older version still reopens its app.
 * A deep link never reaches `app/index.tsx`, so it wins by construction; the
 * notification taps push over what was restored (`app/_layout.tsx`).
 */
import MockAdapter from "axios-mock-adapter";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { http } from "@/api/http";
import { testQueryClient } from "@/__tests__/queryClient";
import { useAuthStore } from "@/stores/auth.store";
import { LAST_PLACE_KEY, useLastPlace } from "@/stores/lastPlace.store";
import { __resetRestore } from "@/apps/lastPlace";
import Index from "../index";

const mockRoute: { path: string; params: Record<string, string> } = { path: "/", params: {} };
jest.mock("expo-router", () => ({
  usePathname: () => mockRoute.path,
  useGlobalSearchParams: () => mockRoute.params,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => false), setParams: jest.fn() },
  Redirect: ({ href }: { href: unknown }) => {
    const { Text } = jest.requireActual("react-native");
    return jest.requireActual("react").createElement(Text, { testID: "redirect" }, typeof href === "string" ? href : JSON.stringify(href));
  },
}));

const { router } = jest.requireMock("expo-router") as { router: Record<string, jest.Mock> };
let mock: MockAdapter;
const signIn = (id = 7) =>
  useAuthStore.setState({ status: "signedIn", user: { id, email: "alex@example.com", firstName: "Alex", lastName: "Martin", fullName: "Alex Martin", avatar: null } });

async function boot(saved: unknown) {
  if (saved === undefined) await AsyncStorage.removeItem(LAST_PLACE_KEY);
  else await AsyncStorage.setItem(LAST_PLACE_KEY, typeof saved === "string" ? saved : JSON.stringify(saved));
  await useLastPlace.getState().hydrate();
  render(
    <QueryClientProvider client={testQueryClient()}>
      <Index />
    </QueryClientProvider>,
  );
  return screen.getByTestId("redirect").props.children as string;
}

beforeEach(async () => {
  mock = new MockAdapter(http);
  Object.values(router).forEach((fn) => fn.mockClear());
  __resetRestore();
  useLastPlace.setState({ place: null, hydrated: false });
  await AsyncStorage.clear();
  signIn();
});
afterEach(() => mock.restore());

const settle = () => act(async () => new Promise((r) => setTimeout(r, 30)));

describe("reopening (M11)", () => {
  it("the very first launch opens Home", async () => {
    expect(await boot(undefined)).toBe("/home");
  });

  it("signed out opens sign-in, whatever was saved", async () => {
    useAuthStore.setState({ status: "signedOut", user: null });
    expect(await boot({ v: 2, app: "finance", root: "/finance?tab=loans", userId: 7 })).toBe("/sign-in");
  });

  it("left on Home, Home reopens", async () => {
    expect(await boot({ v: 2, app: "home", root: "/home", userId: 7 })).toBe("/home");
    await settle();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("a people-chat thread re-opens over Chats, once fetched, with its name", async () => {
    mock.onGet("/api/v1/conversations/266").reply(200, { conversation: { id: 266, user: { fullname: "Sam QA" }, is_group: false, participants: [], updated_at: "2026-11-17T10:00:00Z" } });
    expect(await boot({ v: 2, app: "chats", root: "/chats", sub: { kind: "thread", id: 266 }, userId: 7 })).toBe("/chats");
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/chat/[id]", params: { id: "266", name: "Sam QA", isGroup: "0" } }));
  });

  it("a thread deleted since stays on Chats", async () => {
    mock.onGet("/api/v1/conversations/266").reply(404);
    expect(await boot({ v: 2, app: "chats", root: "/chats", sub: { kind: "thread", id: 266 }, userId: 7 })).toBe("/chats");
    await settle();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("Finance › Loans reopens Finance › Loans, not Home", async () => {
    expect(await boot({ v: 2, app: "finance", root: "/finance?tab=loans", userId: 7 })).toBe("/finance?tab=loans");
    await settle();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("SafeZone reopens SafeZone (its PIN gate: the lock lives in memory)", async () => {
    expect(await boot({ v: 2, app: "safezone", root: "/safezone", userId: 7 })).toBe("/safezone");
  });

  it("a Tasks list re-opens over Tasks once it is fetched again", async () => {
    mock.onGet("/api/v1/todo_app/todo_groups/12").reply(200, { todo_group: { id: 12, name: "Groceries QA", todos: [], todos_count: 0, completed_count: 0, pending_count: 0, overdue_count: 0 } });
    expect(await boot({ v: 2, app: "todos", root: "/todos", sub: { kind: "list", id: 12 }, userId: 7 })).toBe("/todos");
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/todos/list", params: { id: "12" } }));
  });

  it("a list deleted since stays on Tasks' root, never Home (M12)", async () => {
    mock.onGet("/api/v1/todo_app/todo_groups/12").reply(404, { error: "Not found" });
    expect(await boot({ v: 2, app: "todos", root: "/todos", sub: { kind: "list", id: 12 }, userId: 7 })).toBe("/todos");
    await settle();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalledWith("/home");
  });

  it("offline, a loan cannot be fetched: Finance › Loans stays, never Home (M12)", async () => {
    mock.onGet(/\/loans\/7$/).networkError();
    expect(await boot({ v: 2, app: "finance", root: "/finance?tab=loans", sub: { kind: "loan", id: 7 }, userId: 7 })).toBe("/finance?tab=loans");
    await settle();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("an event re-opens on its day", async () => {
    mock.onGet("/api/v1/calendar_app/events/5").reply(200, { event: { id: 5, title: "Dentist QA", kind: "event", all_day: false, starts_at: "2026-11-20T18:30:00Z" } });
    await boot({ v: 2, app: "calendar", root: "/calendar", sub: { kind: "event", id: 5, on: "2026-11-20" }, userId: 7 });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/calendar/event", params: { id: "5", on: "2026-11-20" } }));
  });

  it("a Finance list (Reports) re-opens over Finance without a fetch", async () => {
    await boot({ v: 2, app: "finance", root: "/finance", sub: { kind: "screen", path: "/finance/reports" }, userId: 7 });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/finance/reports"));
  });

  it("restores once per launch, not on every render", async () => {
    mock.onGet("/api/v1/todo_app/todo_groups/12").reply(200, { todo_group: { id: 12, name: "Groceries QA", todos: [] } });
    await boot({ v: 2, app: "todos", root: "/todos", sub: { kind: "list", id: 12 }, userId: 7 });
    screen.rerender(
      <QueryClientProvider client={testQueryClient()}>
        <Index />
      </QueryClientProvider>,
    );
    await settle();
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("a save from an older version still reopens its app (M13)", async () => {
    expect(await boot({ app: "notes" })).toBe("/notes");
    __resetRestore();
    expect(await boot("not even json")).toBe("/home");
  });
});

describe("what keeps and what clears the saved place (M13)", () => {
  it("is cleared on sign-out", async () => {
    await useLastPlace.getState().record({ app: "todos", root: "/todos" }, 7);
    expect(await AsyncStorage.getItem(LAST_PLACE_KEY)).not.toBeNull();
    act(() => useAuthStore.setState({ status: "signedOut", user: null }));
    await waitFor(async () => expect(await AsyncStorage.getItem(LAST_PLACE_KEY)).toBeNull());
    expect(useLastPlace.getState().place).toBeNull();
  });

  it("is cleared when another account signs in", async () => {
    await useLastPlace.getState().record({ app: "finance", root: "/finance" }, 7);
    act(() => useAuthStore.setState({ status: "unknown", user: null }));
    act(() => signIn(99));
    await waitFor(() => expect(useLastPlace.getState().place).toBeNull());
  });

  it("is not reopened for another account even if it survived (a reinstall, a crash)", async () => {
    signIn(99);
    expect(await boot({ v: 2, app: "finance", root: "/finance", userId: 7 })).toBe("/home");
  });

  it("is kept for the same account signing in again", async () => {
    await useLastPlace.getState().record({ app: "notes", root: "/notes" }, 7);
    act(() => signIn(7));
    expect(useLastPlace.getState().place?.app).toBe("notes");
  });

  it("a write survives a restart (it is on the phone, not in memory)", async () => {
    await useLastPlace.getState().record({ app: "calendar", root: "/calendar" }, 7);
    useLastPlace.setState({ place: null, hydrated: false });
    await useLastPlace.getState().hydrate();
    expect(useLastPlace.getState().place).toEqual({ v: 2, app: "calendar", root: "/calendar", userId: 7 });
  });

  it("storage that cannot be read is no place, not a crash", async () => {
    // The library's mock is already a jest.fn: queue one failure on it (a spy's
    // restore would wipe the mock's own implementation for the next tests).
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("locked"));
    await useLastPlace.getState().hydrate();
    expect(useLastPlace.getState()).toEqual(expect.objectContaining({ place: null, hydrated: true }));
  });
});

describe("PlaceRecorder: moving between apps saves the place (M11)", () => {
  const { PlaceRecorder } = jest.requireActual("@/apps/PlaceRecorder") as typeof import("@/apps/PlaceRecorder");
  const at = (path: string, params: Record<string, string> = {}) => {
    mockRoute.path = path;
    mockRoute.params = params;
  };
  const mount = () =>
    render(
      <QueryClientProvider client={testQueryClient()}>
        <PlaceRecorder />
      </QueryClientProvider>,
    );

  it("saves Finance › Loans, with whose it is", async () => {
    at("/finance", { tab: "loans" });
    mount();
    await waitFor(() => expect(useLastPlace.getState().place).toEqual({ v: 2, app: "finance", root: "/finance?tab=loans", userId: 7 }));
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(LAST_PLACE_KEY)) ?? "{}").root).toBe("/finance?tab=loans"));
  });

  it("leaving from Home saves Home (reopen where he left)", async () => {
    await useLastPlace.getState().record({ app: "todos", root: "/todos" }, 7);
    at("/home");
    mount();
    await waitFor(() => expect(useLastPlace.getState().place?.app).toBe("home"));
  });

  it("opening a form over Finance › Expenses keeps Finance › Expenses saved", async () => {
    await useLastPlace.getState().record({ app: "finance", root: "/finance?tab=expenses" }, 7);
    at("/finance/entry", { kind: "expense" });
    mount();
    await settle();
    expect(useLastPlace.getState().place?.root).toBe("/finance?tab=expenses");
  });

  it("signed out, nothing is saved", async () => {
    useAuthStore.setState({ status: "signedOut", user: null });
    at("/notes");
    mount();
    await settle();
    expect(useLastPlace.getState().place).toBeNull();
  });
});
