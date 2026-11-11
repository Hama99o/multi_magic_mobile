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

it("the Assistant tile opens the plain assistant, not the history", () => {
  renderHome();
  fireEvent.press(screen.getByTestId("home-tile-ai"));
  expect(mockPush).toHaveBeenCalledWith("/chat");
});
