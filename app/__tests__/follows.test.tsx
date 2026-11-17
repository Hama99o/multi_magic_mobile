/** Followers and following (MANIFEST row 19): tabs, follow back, unfollow asked first, paging. */
import { Alert } from "react-native";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ tab: "followers" })),
}));

/** Lets a mutation that was started reach its API call before asserting none was. */
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/* eslint-disable import/first */
import { profileApi, type Profile } from "@/api/profile";
import { followsApi } from "@/api/follows";
import Follows from "../follows";

const person = (id: number, isFollowing = false) => ({ id, name: `Person ${id}`, username: `p${id}`, avatar: null, isFollowing });

function renderScreen() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <Follows />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(profileApi, "me").mockResolvedValue({ id: 8, followersCount: 2, followingCount: 1 } as Profile);
});
afterEach(() => jest.restoreAllMocks());

it("follows back from the followers tab, and pages", async () => {
  const list = jest.spyOn(followsApi, "list").mockImplementation(async (_id, _kind, page) =>
    page === 1
      ? { rows: [person(1)], unreadable: 0, page: 1, next: 2, total: 2 }
      : { rows: [person(2, true)], unreadable: 0, page: 2, next: null, total: 2 },
  );
  const follow = jest.spyOn(followsApi, "follow").mockResolvedValue();
  renderScreen();
  fireEvent.press(await screen.findByTestId("follows-follow-1"));
  await waitFor(() => expect(follow).toHaveBeenCalledWith(1));
  fireEvent.press(await screen.findByTestId("follows-more"));
  expect(await screen.findByTestId("follows-unfollow-2")).toBeTruthy();
  expect(list).toHaveBeenCalledWith(8, "followers", 2);
});

it("asks before unfollowing", async () => {
  jest.spyOn(followsApi, "list").mockResolvedValue({ rows: [person(3, true)], unreadable: 0, page: 1, next: null, total: 1 });
  const unfollow = jest.spyOn(followsApi, "unfollow").mockResolvedValue();
  renderScreen();
  fireEvent.press(await screen.findByTestId("follows-tab-following"));
  fireEvent.press(await screen.findByTestId("follows-unfollow-3"));
  await flush();
  expect(unfollow).not.toHaveBeenCalled();
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { style?: string; onPress?: () => void }[];
  buttons.find((b) => b.style === "destructive")?.onPress?.();
  await waitFor(() => expect(unfollow).toHaveBeenCalledWith(3));
});

it("says so when nobody follows", async () => {
  jest.spyOn(followsApi, "list").mockResolvedValue({ rows: [], unreadable: 0, page: 1, next: null, total: 0 });
  renderScreen();
  expect(await screen.findByTestId("follows-empty")).toHaveTextContent("Nobody follows you yet.");
});
