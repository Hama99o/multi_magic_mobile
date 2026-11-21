/**
 * REVIEW (feat/global-search @ 2559fdb): two bugs, each proven red here and
 * left unfixed on purpose. Invented rows only (example.test).
 *
 * S1 — `routeForWebPath` has no `/explorer` case. The server's search sends a
 *   Pages hit as `/explorer/:space_id` (a space) and
 *   `/explorer/:space_id?folder=|node=|preview=:id` (a node)
 *   (multi_magic `app/services/search/sources.rb`, the two `page_app`
 *   sources). With no case, every Pages hit returns null and `openRecord`
 *   falls back to asking the assistant about a file the phone can open.
 *
 * S2 — `openRecord` calls `remember({ …subtitle })` for every hit. A SafeZone
 *   hit's subtitle is a username or email (password) or a document number
 *   (identity) (`sources.rb`, the `safezone` sources), and the recents land
 *   in AsyncStorage `mm.search.recents.<uid>` in plaintext — readable without
 *   the SafeZone PIN.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismiss: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
}));
jest.mock("@/hooks/useDraft", () => ({ useDraft: () => ({ draft: "", setDraft: jest.fn() }) }));

/* eslint-disable import/first */
import SearchScreen from "../../../app/search";
import { routeForWebPath } from "../inAppRoute";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useAuthStore } from "@/stores/auth.store";

describe("S1: a Pages search hit opens Pages, not the assistant", () => {
  it("/explorer/:space?preview=:id opens the file viewer", () => {
    expect(routeForWebPath("/explorer/4?preview=9", "Trip.pdf")).toEqual({
      pathname: "/pages/view",
      params: { spaceId: "4", nodeId: "9", title: "Trip.pdf" },
    });
  });

  it("/explorer/:space opens the space's folder screen", () => {
    expect(routeForWebPath("/explorer/4", "Trips")).toEqual({
      pathname: "/pages/folder",
      params: { spaceId: "4", title: "Trips" },
    });
  });
});

describe("S2: a SafeZone hit's secret never reaches plaintext recents", () => {
  const SECRET = "ID-889-REVIEW-0042";
  let mock: MockAdapter;

  beforeEach(async () => {
    jest.useFakeTimers();
    mock = new MockAdapter(http);
    __resetTokenCache();
    __resetFingerprintCache();
    await AsyncStorage.clear();
    useAuthStore.setState({ status: "signedIn", user: { id: 1, email: "qa@example.test", fullName: "QA" } as never });
    mock.onGet("/api/v1/ai/conversation").reply(200, { conversation: { id: 55 } });
    mock.onGet("/api/v1/search").reply((cfg) => [
      200,
      {
        query: cfg.params.q,
        results: [
          { id: "identity:3", group: "safezone", kind: "identity", title: "Passport", subtitle: SECRET, to: "/safezone/identities?identity=3", score: 80 },
        ],
        counts: [],
      },
    ]);
  });
  afterEach(() => {
    mock.restore();
    jest.useRealTimers();
  });

  it("tapping an identity hit stores no document number in mm.search.recents.<uid>", async () => {
    const setItem = jest.spyOn(AsyncStorage, "setItem");
    render(
      <QueryClientProvider client={testQueryClient()}>
        <SearchScreen />
      </QueryClientProvider>,
    );
    fireEvent.changeText(screen.getByTestId("search-input"), "passport");
    await act(async () => {
      jest.advanceTimersByTime(350);
    });
    const row = await screen.findByTestId("search-hit-identity:3");
    await act(async () => {
      fireEvent.press(row);
    });

    // The tap landed (it opened the vault item), so whatever was stored, was stored by it.
    const router = jest.requireMock("expo-router").router as Record<string, jest.Mock>;
    expect(router.push).toHaveBeenCalledWith({ pathname: "/safezone/item", params: { kind: "identities", id: "3" } });
    // Not remembering a SafeZone hit at all is a fix too; storing its secret is not.
    const recentsWrites = setItem.mock.calls.filter(([key]) => key === "mm.search.recents.1");
    for (const [, value] of recentsWrites) expect(value).not.toContain(SECRET);
    setItem.mockRestore();
  });
});
