/**
 * RED tests from the feat/flow-app review (2026-11-21). Each one proves a
 * defect that is in the code today; none of them fixes it.
 *
 * 1. `useMoveCard` reads the column order from whichever sprint scope was
 *    cached FIRST, not the one on screen, and sends it to `cards/reorder`,
 *    which moves every listed id into that column (`flowApi.reorderCards`).
 * 2. Reorder mode survives a Priority sort or a filter, and ▲ then sends the
 *    sorted (or filtered) list as the column's manual order.
 * 3. "Save" in the unsaved-title alert leaves at once; when the save fails,
 *    nobody is told.
 */
import MockAdapter from "axios-mock-adapter";
import { Alert } from "react-native";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { flowKeys } from "@/api/keys";
import { flowApi, type Board, type Card } from "@/api/flow";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import board from "@/api/__tests__/fixtures/flow_board.json";
import { useMoveCard } from "../useFlowMutations";
import BoardScreen from "../../../../app/flow/board";
import CardScreen from "../../../../app/flow/card";

const mockParams: { current: Record<string, string> } = { current: {} };
// One navigation object for the whole render, so the `beforeRemove` listener can be fired.
const mockNav = { listeners: [] as ((e: unknown) => void)[], dispatch: jest.fn() };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
  useNavigation: () => ({
    addListener: (_name: string, fn: (e: unknown) => void) => {
      mockNav.listeners.push(fn);
      return () => {
        mockNav.listeners = mockNav.listeners.filter((l) => l !== fn);
      };
    },
    dispatch: mockNav.dispatch,
  }),
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock("expo-clipboard", () => require("@/__tests__/screenMocks").clipboard);

const B = "/api/v1/flow_app";
let mock: MockAdapter;

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mockParams.current = {};
  mockNav.listeners = [];
  mockNav.dispatch.mockClear();
  await i18n.changeLanguage("en");
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

const renderScreen = (element: ReactElement) => render(<QueryClientProvider client={testQueryClient()}>{element}</QueryClientProvider>);
const bodies = (method: "put" | "patch", url: string) => mock.history[method].filter((r) => r.url === url).map((r) => (r.data ? JSON.parse(r.data) : null));

// ── 1. A move reads the order of the wrong sprint scope ───────────────────

const card = (id: number, columnId: number, sprintId: number | null): Card => ({
  id, projectId: 7, columnId, sprintId, title: `#${id}`, description: null, position: 1, dueDate: null,
  creator: { id: 1, name: "" }, commentsCount: 0, fieldValues: {}, createdAt: "", updatedAt: "",
});
const boardOf = (cards: Card[]): InfiniteData<Board> => ({
  pageParams: [1],
  pages: [{ cards } as unknown as Board],
});

describe("bug 1: useMoveCard (useFlowMutations.ts:196)", () => {
  it("sends the order of the scope on screen, not of the scope cached first", async () => {
    const client = testQueryClient();
    // Cached first: the backlog, where card 9 sits in column 2.
    client.setQueryData(flowKeys.board(7, "backlog"), boardOf([card(9, 2, null)]));
    // On screen: sprint 5, where card 1 sits in column 1.
    client.setQueryData(flowKeys.board(7, 5), boardOf([card(1, 1, 5)]));
    jest.spyOn(flowApi, "moveCard").mockResolvedValue(card(1, 2, 5));
    const reorder = jest.spyOn(flowApi, "reorderCards").mockResolvedValue();

    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useMoveCard(7), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ card: card(1, 1, 5), toColumn: 2, index: 0 });
    });

    expect(reorder).toHaveBeenCalledTimes(1);
    const sent = reorder.mock.calls[0][1];
    // Column 2 must hold the card just moved into it.
    expect(sent.find((c) => c.columnId === 2)?.ids).toContain(1);
  });
});

// ── 2. Reorder mode survives a sort or a filter ───────────────────────────

const cardsOnly = board.cards.filter((c) => typeof c.id === "number") as (typeof board.cards)[number][];
// To Do (11), manual order 900 (High), 901 (none), 902 (Critical).
const third = { ...cardsOnly[1], id: 902, title: "Third", position: 3, field_values: { 101: { scalar_value: "critical" } } };
const toDo = [...cardsOnly, third];
const boardAsMember = () => ({
  ...board,
  cards: toDo,
  project: { ...board.project, my_role: "member" },
  page: { page: 1, limit: 100, total: toDo.length, has_more: false, next_page: null },
});

async function enterReorderOnToDo() {
  mockParams.current = { id: "7" };
  mock.onGet(`${B}/projects/7/board`).reply(200, boardAsMember());
  mock.onPut(`${B}/projects/7/cards/reorder`).reply(204);
  renderScreen(<BoardScreen />);
  await screen.findByText("Third");
  fireEvent.press(screen.getByTestId("flow-column-1-menu"));
  fireEvent.press(screen.getByText(i18n.t("flow.reorder.column")));
  expect(screen.getByTestId("flow-reorder")).toBeTruthy();
}

/** ▲ on the last row shown, if reorder mode is still there to press. */
function pressLastUp() {
  const ups = screen.queryAllByTestId("flow-reorder-up");
  if (ups.length) fireEvent.press(ups[ups.length - 1]);
}

// 88's follow-up (scenario B), added by ff: the fix must not prefer a STALE
// cached "all" board over the scope on screen. An "all" board cached minutes ago
// still holds card 9 in column 2, which the web has since moved away; the
// sprint on screen does not. Moving card 1 into column 2 from the sprint must
// not send 9: the server would write it back into column 2.
describe("bug 1b: useMoveCard with a stale 'all' board cached", () => {
  it("reads the scope on screen, not a cached 'all' board", async () => {
    const client = testQueryClient();
    client.setQueryData(flowKeys.board(7, "all"), boardOf([card(1, 1, 5), card(9, 2, null)]));
    client.setQueryData(flowKeys.board(7, 5), boardOf([card(1, 1, 5)]));
    jest.spyOn(flowApi, "moveCard").mockResolvedValue(card(1, 2, 5));
    const reorder = jest.spyOn(flowApi, "reorderCards").mockResolvedValue();

    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useMoveCard(7), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ card: card(1, 1, 5), toColumn: 2, index: 0, scope: 5 });
    });

    const sent = reorder.mock.calls[0][1];
    expect(sent.find((c) => c.columnId === 2)?.ids).toEqual([1]);
  });
});

describe("bug 2: reorder mode after a sort or a filter (board.tsx:325, BoardColumn.tsx:133)", () => {
  it("does not send the Priority order as the column's manual order", async () => {
    await enterReorderOnToDo();
    fireEvent.press(screen.getByTestId("flow-filter-button"));
    fireEvent.press(screen.getByTestId("flow-sort-priority"));
    fireEvent.press(screen.getByTestId("flow-filter-done"));
    pressLastUp();
    await act(async () => undefined);
    // Manual is 900, 901, 902. Anything sent here was built from the priority list.
    expect(bodies("put", `${B}/projects/7/cards/reorder`)).toEqual([]);
  });

  it("does not send a filtered subset as the column's whole order", async () => {
    await enterReorderOnToDo();
    fireEvent.press(screen.getByTestId("flow-filter-button"));
    fireEvent.press(screen.getByTestId("flow-filter-priority-high"));
    fireEvent.press(screen.getByTestId("flow-filter-priority-critical"));
    fireEvent.press(screen.getByTestId("flow-filter-done"));
    pressLastUp();
    await act(async () => undefined);
    // 901 is hidden by the filter; a list without it is not the column's order.
    expect(bodies("put", `${B}/projects/7/cards/reorder`)).toEqual([]);
  });
});

// ── 3. "Save" in the unsaved-title alert leaves before it knows ───────────

describe("bug 3: Save from the unsaved-changes alert (card.tsx:155)", () => {
  it("does not leave while the save can still fail, and says so when it does", async () => {
    mockParams.current = { projectId: "7", id: "900" };
    mock.onGet(`${B}/projects/7/board`).reply(200, boardAsMember());
    mock.onGet(`${B}/projects/7/cards/900`).reply(200, { card: cardsOnly[0] });
    mock.onGet(`${B}/projects/7/cards/900/comments`).reply(200, { comments: [] });
    mock.onPatch(`${B}/projects/7/cards/900`).reply(500, {});
    const alert = jest.spyOn(Alert, "alert");

    renderScreen(<CardScreen />);
    fireEvent.press(await screen.findByTestId("flow-card-title"));
    fireEvent.changeText(screen.getByTestId("flow-card-title-input"), "[qa] Renamed");
    // The back gesture.
    const leave = { preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } };
    act(() => mockNav.listeners.forEach((l) => l(leave)));
    expect(leave.preventDefault).toHaveBeenCalled();
    const save = alert.mock.calls[0][2]?.find((b) => b.text === i18n.t("fields.save"));
    act(() => save?.onPress?.());

    await waitFor(() => expect(bodies("patch", `${B}/projects/7/cards/900`)).toHaveLength(1));
    // The PATCH is refused. Leaving now loses both the title and the news.
    expect(await screen.findByTestId("flow-card-note")).toBeTruthy();
    expect(mockNav.dispatch).not.toHaveBeenCalled();
  });
});
