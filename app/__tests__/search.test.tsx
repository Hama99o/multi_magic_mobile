/**
 * GLOBAL SEARCH (docs/design/search/SPEC.md): one field for every app, over
 * GET /api/v1/search. The real screen against a fake server. Seeded, invented
 * rows only.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockParams: { q?: string } = {};
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismiss: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams,
}));
const mockDraft = { text: null as string | null };
jest.mock("@/hooks/useDraft", () => ({ useDraft: () => ({ draft: "", setDraft: (v: string) => void (mockDraft.text = v) }) }));

/* eslint-disable import/first */
import SearchScreen from "../search";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useAuthStore } from "@/stores/auth.store";

const router = jest.requireMock("expo-router").router as Record<string, jest.Mock>;

const hit = (over: Record<string, unknown> = {}) => ({
  id: "note:7", group: "notes", kind: "note", title: "Trip plan", subtitle: "Day 1: arrive", to: "/notes/7", score: 86, ...over,
});
const RESULTS = [
  hit(),
  hit({ id: "expense:3", group: "finance", kind: "expense", title: "Train to Lyon", subtitle: "42.00 EUR", to: "/finance/expenses?expense=3", score: 62 }),
  hit({ id: "card:9", group: "flow", kind: "card", title: "Trip budget", subtitle: null, to: "/flow/2?card=9", score: 62 }),
];

let mock: MockAdapter;
beforeEach(async () => {
  jest.useFakeTimers();
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  Object.values(router).forEach((f) => f.mockClear());
  mockDraft.text = null;
  delete mockParams.q;
  await AsyncStorage.clear();
  useAuthStore.setState({ status: "signedIn", user: { id: 1, email: "qa@example.com", fullName: "QA" } as never });
  mock.onGet("/api/v1/ai/conversation").reply(200, { conversation: { id: 55 } });
  mock.onGet("/api/v1/search").reply((cfg) => [200, { query: cfg.params.q, results: RESULTS, counts: [] }]);
});
afterEach(() => {
  mock.restore();
  jest.useRealTimers();
});

const open = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <SearchScreen />
    </QueryClientProvider>,
  );
const type = async (text: string) => {
  fireEvent.changeText(screen.getByTestId("search-input"), text);
  await act(async () => {
    jest.advanceTimersByTime(350);
  });
};
const searches = () => mock.history.get.filter((r) => r.url === "/api/v1/search");

it("opens with the field ready, and before typing offers every app (never a dead end)", async () => {
  open();
  expect(screen.getByTestId("search-input").props.autoFocus).toBe(true);
  expect(await screen.findByTestId("search-section-apps")).toBeTruthy();
  expect(screen.getByTestId("search-app-notes")).toBeTruthy();
  expect(screen.getByTestId("search-app-finance")).toBeTruthy();
  expect(searches()).toHaveLength(0);
});

it("one character matches apps and commands here; the server is asked from two, once per pause", async () => {
  open();
  await type("n");
  expect(screen.getByTestId("search-app-notes")).toBeTruthy();
  expect(screen.queryByTestId("search-app-finance")).toBeNull();
  expect(searches()).toHaveLength(0);
  fireEvent.changeText(screen.getByTestId("search-input"), "tr");
  fireEvent.changeText(screen.getByTestId("search-input"), "tri");
  await type("trip");
  await waitFor(() => expect(searches()).toHaveLength(1));
  expect(searches()[0].params).toEqual({ q: "trip" });
});

it("records come under their app's heading, in the server's order, after Ask the assistant", async () => {
  open();
  await type("trip");
  expect(await screen.findByTestId("search-hit-note:7")).toBeTruthy();
  expect(screen.getByTestId("search-ask")).toHaveTextContent(/trip/);
  expect(within(screen.getByTestId("search-section-notes")).getByText("Trip plan")).toBeTruthy();
  expect(within(screen.getByTestId("search-section-finance")).getByText("42.00 EUR")).toBeTruthy();
  const ids = screen.getAllByTestId(/^search-hit-/).map((n) => n.props.testID);
  expect(ids).toEqual(["search-hit-note:7", "search-hit-expense:3", "search-hit-card:9"]);
});

it("a hit with a screen opens it, and is remembered at the top of Recent next time", async () => {
  const view = open();
  await type("trip");
  fireEvent.press(await screen.findByTestId("search-hit-expense:3"));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/finance/entry", params: { kind: "expense", id: "3" } });
  view.unmount();
  open();
  const recent = await screen.findByTestId("search-section-recents");
  expect(within(recent).getByText("Train to Lyon")).toBeTruthy();
  fireEvent.press(screen.getByTestId("search-recents-clear"));
  await waitFor(() => expect(screen.queryByTestId("search-section-recents")).toBeNull());
});

it("a hit with no screen on the phone asks the assistant about it (composed, not sent)", async () => {
  open();
  await type("trip");
  fireEvent.press(await screen.findByTestId("search-hit-card:9"));
  await waitFor(() => expect(mockDraft.text).toMatch(/Trip budget/));
  expect(router.push).toHaveBeenCalledWith("/chat");
});

it("Ask the assistant puts the query in the composer", async () => {
  open();
  await type("trip");
  fireEvent.press(await screen.findByTestId("search-ask"));
  await waitFor(() => expect(mockDraft.text).toMatch(/trip/));
  expect(router.push).toHaveBeenCalledWith("/chat");
});

it("a command opens its form: New expense", async () => {
  open();
  await type("new exp");
  fireEvent.press(await screen.findByTestId("search-command-new-expense"));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/finance/entry", params: { kind: "expense" } });
});

it("nothing found says so and still offers Ask", async () => {
  mock.onGet("/api/v1/search").reply(200, { query: "zzzz", results: [], counts: [] });
  open();
  await type("zzzz");
  expect(await screen.findByTestId("search-empty")).toHaveTextContent(/zzzz/);
  expect(screen.getByTestId("search-ask")).toBeTruthy();
});

it("a failed search says so with Try again", async () => {
  mock.onGet("/api/v1/search").reply(500, {});
  open();
  await type("trip");
  expect(await screen.findByTestId("search-failed")).toBeTruthy();
});

it("Cancel goes back to where search was opened", () => {
  open();
  fireEvent.press(screen.getByTestId("search-cancel"));
  expect(router.back).toHaveBeenCalled();
});

it("opened from the Apps sheet with text, it searches that text at once", async () => {
  mockParams.q = "trip";
  open();
  expect(screen.getByTestId("search-input").props.value).toBe("trip");
  await act(async () => {
    jest.advanceTimersByTime(350);
  });
  await waitFor(() => expect(searches()).toHaveLength(1));
});

it("an app is found by its line too, as in the Apps sheet (“passwords” finds SafeZone)", async () => {
  open();
  await type("passwords");
  expect(screen.getByTestId("search-app-safezone")).toBeTruthy();
});
