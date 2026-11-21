/**
 * HOME'S TILES go where their names say (docs/QA_FULL.md F2).
 *
 * The Conversations tile ("Your past questions") used to `router.push("/chat")`
 * exactly like the Assistant tile, so both opened the plain assistant and the
 * history was two taps away behind a tile that promised it. `chat.session.test`
 * pins the receiving half (`?sessions=1` opens on the history); this pins the
 * sending half, which is the half that was wrong.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
  usePathname: () => "/home",
}));
jest.mock("@/lib/cable", () => ({ subscribeToChannel: () => () => {} }));

/* eslint-disable import/first */
import Home from "../home";
import { notificationsApi } from "@/api/notifications";
import { testQueryClient } from "@/__tests__/queryClient";

function renderHome() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <Home />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  jest.spyOn(notificationsApi, "list").mockResolvedValue({ notifications: [], unreadCount: 0, hasMore: false });
});
afterEach(() => jest.restoreAllMocks());

it("the Conversations tile opens the assistant ON its history", () => {
  renderHome();
  fireEvent.press(screen.getByTestId("home-tile-conversations"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/chat", params: { sessions: "1" } });
});

it("the SafeZone tile opens SafeZone", () => {
  renderHome();
  fireEvent.press(screen.getByTestId("home-tile-safezone"));
  expect(mockPush).toHaveBeenCalledWith("/safezone");
});

it("the Assistant tile opens the plain assistant, not the history", () => {
  renderHome();
  fireEvent.press(screen.getByTestId("home-tile-ai"));
  expect(mockPush).toHaveBeenCalledWith("/chat");
});

// Owner, 2026-11-15: "make each one good, why does Pages have colour and the
// others not". Each tile wears its app's colour (src/theme/appColors.ts):
// a tinted card and a solid badge; none is filled louder than the others.
describe("each app has its own colour", () => {
  it("every tile has its app's badge colour and none is a filled accent card", () => {
    renderHome();
    const { APP_COLORS, HOME_APPS } = jest.requireActual("@/theme/appColors");
    for (const app of HOME_APPS) {
      const badge = screen.getByTestId(`home-tile-${app === "assistant" ? "ai" : app}-badge`);
      const style = [badge.props.style].flat().reduce((a: object, b: object) => ({ ...a, ...b }), {}) as { backgroundColor?: string };
      expect([app, style.backgroundColor]).toEqual([app, APP_COLORS[app]]);
    }
  });

  it("in 2 columns the last tile is a normal tile, not a lonely full-width card", () => {
    renderHome();
    const style = (id: string) => [screen.getByTestId(id).props.style].flat().reduce((a: object, b: object) => ({ ...a, ...b }), {});
    expect(style("home-tile-conversations").width).toBe(style("home-tile-pages").width);
    expect(style("home-tile-conversations").flexGrow ?? 0).toBe(0);
  });
});

// Global search (docs/design/search/SPEC.md §C, Hello for the owner
// 2026-11-21): on a phone the header has no room for a search key, so Home
// opens search from a field at its top.
it("the search field at the top of Home opens global search", () => {
  renderHome();
  fireEvent.press(screen.getByTestId("home-search"));
  expect(mockPush).toHaveBeenCalledWith("/search");
});
