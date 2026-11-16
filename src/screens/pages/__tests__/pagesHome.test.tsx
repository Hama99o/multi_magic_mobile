/**
 * THE PAGES HOME SHELL:
 * - the Shared tab says when it could not load, with Retry, like the other
 *   tabs (audit #22, 2026-11-16: it was blank);
 * - back goes to the app grid the way Notes does (owner's known issue,
 *   2026-11-16): back if Home is behind, otherwise Home; Android back at
 *   Pages with nothing behind goes Home instead of leaving the app.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { BackHandler } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

const page = (rows: unknown[]) => ({ rows, hasMore: false, unreadable: 0, total: rows.length });
const mockApi = {
  sharedWithMe: jest.fn(),
  drive: jest.fn(async () => page([])),
  spaces: jest.fn(async () => page([])),
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: new Proxy({}, { get: (_t, key: string) => (...a: unknown[]) => (mockApi as Record<string, (...x: unknown[]) => unknown>)[key](...a) }),
}));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams.current,
}));

/* eslint-disable import/first */
import PagesHome from "../../../../app/pages/index";

const { router } = jest.requireMock("expo-router") as { router: { back: jest.Mock; replace: jest.Mock; canGoBack: jest.Mock } };

function wrap() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <PagesHome />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  router.canGoBack.mockReturnValue(true);
  mockParams.current = {};
});

describe("the Shared tab", () => {
  it("a failure is said, with Try again, which asks again", async () => {
    mockParams.current = { tab: "shared" };
    mockApi.sharedWithMe.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValueOnce(page([{ id: 1, permission: "viewer", space: { id: 400, title: "Family", icon: "🏠" }, node: null }]));
    wrap();
    expect(await screen.findByTestId("pages-shared-failed")).toBeTruthy();
    expect(screen.queryByTestId("pages-shared-empty")).toBeNull();
    await act(async () => fireEvent.press(screen.getByText("Try again")));
    expect(await screen.findByText("Family")).toBeTruthy();
    expect(mockApi.sharedWithMe).toHaveBeenCalledTimes(2);
  });
});

describe("back to the app grid (Home) from Pages", () => {
  it("with Home behind, back goes back to it", async () => {
    wrap();
    fireEvent.press(await screen.findByTestId("pages-back"));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("opened with nothing behind (a share, a link), back replaces with Home", async () => {
    router.canGoBack.mockReturnValue(false);
    wrap();
    fireEvent.press(await screen.findByTestId("pages-back"));
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/home");
  });

  it("Android back with nothing behind goes Home instead of leaving the app", async () => {
    const handlers: (() => boolean)[] = [];
    const spy = jest.spyOn(BackHandler, "addEventListener").mockImplementation((...args: unknown[]) => {
      handlers.push(args[1] as () => boolean);
      return { remove: () => undefined };
    });
    router.canGoBack.mockReturnValue(false);
    wrap();
    await screen.findByTestId("pages-back");
    let handled = false;
    act(() => {
      handled = handlers.some((h) => h());
    });
    expect(handled).toBe(true);
    expect(router.replace).toHaveBeenCalledWith("/home");
    spy.mockRestore();
  });

  it("Android back with history lets the stack go back", async () => {
    const handlers: (() => boolean)[] = [];
    const spy = jest.spyOn(BackHandler, "addEventListener").mockImplementation((...args: unknown[]) => {
      handlers.push(args[1] as () => boolean);
      return { remove: () => undefined };
    });
    wrap();
    await screen.findByTestId("pages-back");
    expect(handlers.length).toBeGreaterThan(0);
    let handled = true;
    act(() => {
      handled = handlers.some((h) => h());
    });
    expect(handled).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
