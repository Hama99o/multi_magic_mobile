/**
 * The people-chats list, past its first page. Found by the volume audit,
 * 2026-09-24: the screen asked for page 1 (15 conversations,
 * `conversations_controller.rb`) and never another, so a sixteenth
 * conversation could not be reached from the phone at all.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));
jest.mock("@/lib/cable", () => ({ subscribeToChannel: () => () => {} }));

/* eslint-disable import/first */
import Chats from "../chats";
import { conversationsApi, peopleApi, type Conversation, type Person } from "@/api/conversations";
import { testQueryClient } from "@/__tests__/queryClient";

const conversation = (id: number): Conversation =>
  ({
    id, displayName: `Person ${id}`, isGroup: false, isOnline: false, avatar: null, participants: [],
    lastMessage: null, unreadMessages: 0, canDelete: true, isAdmin: false, updatedAt: new Date().toISOString(),
  }) as Conversation;

function renderScreen() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <Chats />
    </QueryClientProvider>,
  );
}

const { router } = jest.requireMock("expo-router") as {
  router: { push: jest.Mock; back: jest.Mock; replace: jest.Mock; canGoBack: jest.Mock };
};
beforeEach(() => {
  router.push.mockClear();
  router.back.mockClear();
  router.replace.mockClear();
  router.canGoBack.mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

it("loads the next page at the end of the list, once per conversation", async () => {
  const list = jest.spyOn(conversationsApi, "list").mockImplementation(async (page = 1) =>
    page === 1
      ? { conversations: [conversation(1), conversation(2)], unreadConversations: 0, hasMore: true }
      : { conversations: [conversation(2), conversation(3)], unreadConversations: 0, hasMore: false },
  );
  renderScreen();
  await screen.findByText("Person 1");
  await act(async () => {
    fireEvent(screen.getByTestId("chats-list"), "endReached");
  });
  expect(await screen.findByText("Person 3")).toBeTruthy();
  expect(list).toHaveBeenCalledWith(2);
  // A conversation that moved between pages is drawn once.
  expect(screen.getAllByText("Person 2")).toHaveLength(1);
});

it("does not ask past the last page", async () => {
  const list = jest
    .spyOn(conversationsApi, "list")
    .mockResolvedValue({ conversations: [conversation(1)], unreadConversations: 0, hasMore: false });
  renderScreen();
  await screen.findByText("Person 1");
  await act(async () => {
    fireEvent(screen.getByTestId("chats-list"), "endReached");
  });
  expect(list).toHaveBeenCalledTimes(1);
});

// ── STARTING A CONVERSATION (audit P0 #4) ─────────────────────────────────
// The phone could only read and reply. The web starts one from a people
// picker, direct or a named group (NewConversationDialog.tsx).
describe("starting a conversation", () => {
  const person = (id: number, name: string): Person => ({ id, name, firstName: name.split(" ")[0], email: null, avatar: null });
  const empty = { conversations: [], unreadConversations: 0, hasMore: false };

  beforeEach(() => {
    jest.spyOn(peopleApi, "search").mockResolvedValue({ people: [person(2, "Anisa Rahimi"), person(3, "Sam Doe")], hasMore: false });
  });

  it("the empty list offers it", async () => {
    jest.spyOn(conversationsApi, "list").mockResolvedValue(empty);
    renderScreen();
    fireEvent.press(await screen.findByTestId("chats-empty-start"));
    expect(await screen.findByTestId("new-conversation-sheet")).toBeTruthy();
  });

  it("+ opens the picker; one person and Start opens the new thread", async () => {
    jest.spyOn(conversationsApi, "list").mockResolvedValue({ ...empty, conversations: [conversation(1)] });
    const create = jest.spyOn(conversationsApi, "create").mockResolvedValue({ ...conversation(40), displayName: "Anisa Rahimi" });
    renderScreen();
    fireEvent.press(await screen.findByLabelText("New conversation"));
    fireEvent.press(await screen.findByTestId("person-2"));
    fireEvent.press(screen.getByTestId("new-conversation-start"));
    await waitFor(() => expect(create).toHaveBeenCalledWith(2));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/chat/[id]",
      params: { id: "40", name: "Anisa Rahimi", isGroup: "0", unread: "0" },
    });
  });

  it("Start waits for a choice", async () => {
    jest.spyOn(conversationsApi, "list").mockResolvedValue(empty);
    const create = jest.spyOn(conversationsApi, "create");
    renderScreen();
    fireEvent.press(await screen.findByLabelText("New conversation"));
    await screen.findByTestId("person-2");
    fireEvent.press(screen.getByTestId("new-conversation-start"));
    expect(create).not.toHaveBeenCalled();
  });

  it("a group takes two people or more and its name", async () => {
    jest.spyOn(conversationsApi, "list").mockResolvedValue(empty);
    const createGroup = jest
      .spyOn(conversationsApi, "createGroup")
      .mockResolvedValue({ ...conversation(41), displayName: "Trip", isGroup: true });
    renderScreen();
    fireEvent.press(await screen.findByLabelText("New conversation"));
    fireEvent.press(await screen.findByTestId("new-conversation-group"));
    fireEvent.press(await screen.findByTestId("person-2"));
    fireEvent.changeText(screen.getByTestId("new-conversation-name"), "Trip");
    // One person is not a group yet.
    fireEvent.press(screen.getByTestId("new-conversation-start"));
    expect(createGroup).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("person-3"));
    fireEvent.press(screen.getByTestId("new-conversation-start"));
    await waitFor(() => expect(createGroup).toHaveBeenCalledWith([2, 3], "Trip"));
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ id: "41", isGroup: "1" }) }));
  });

  it("a group with no name is named after its people, as on the web", async () => {
    jest.spyOn(conversationsApi, "list").mockResolvedValue(empty);
    const createGroup = jest.spyOn(conversationsApi, "createGroup").mockResolvedValue({ ...conversation(42), isGroup: true });
    renderScreen();
    fireEvent.press(await screen.findByLabelText("New conversation"));
    fireEvent.press(await screen.findByTestId("new-conversation-group"));
    fireEvent.press(await screen.findByTestId("person-2"));
    fireEvent.press(screen.getByTestId("person-3"));
    fireEvent.press(screen.getByTestId("new-conversation-start"));
    await waitFor(() => expect(createGroup).toHaveBeenCalledWith([2, 3], "Anisa, Sam"));
  });

  it("a refusal is said, and the picker stays open", async () => {
    jest.spyOn(conversationsApi, "list").mockResolvedValue(empty);
    jest.spyOn(conversationsApi, "create").mockRejectedValue({ isAxiosError: true, response: { status: 422, data: { errors: ["Blocked"] } } });
    renderScreen();
    fireEvent.press(await screen.findByLabelText("New conversation"));
    fireEvent.press(await screen.findByTestId("person-2"));
    fireEvent.press(screen.getByTestId("new-conversation-start"));
    expect(await screen.findByTestId("new-conversation-error")).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("searches as you type", async () => {
    jest.spyOn(conversationsApi, "list").mockResolvedValue(empty);
    renderScreen();
    fireEvent.press(await screen.findByLabelText("New conversation"));
    await screen.findByTestId("person-2");
    fireEvent.changeText(screen.getByTestId("new-conversation-search"), "sam");
    await waitFor(() => expect(peopleApi.search).toHaveBeenCalledWith("sam", 1));
  });
});

// ── BACK TO THE APP GRID (owner's known issue; as Notes does) ─────────────
describe("back", () => {
  const empty = { conversations: [], unreadConversations: 0, hasMore: false };

  it("goes back when Home is behind", async () => {
    jest.spyOn(conversationsApi, "list").mockResolvedValue(empty);
    renderScreen();
    fireEvent.press(screen.getByLabelText("Back"));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("goes Home when nothing is behind", async () => {
    router.canGoBack.mockReturnValue(false);
    jest.spyOn(conversationsApi, "list").mockResolvedValue(empty);
    renderScreen();
    fireEvent.press(screen.getByLabelText("Back"));
    expect(router.replace).toHaveBeenCalledWith("/home");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("Android back with nothing behind goes Home instead of leaving the app", async () => {
    const { BackHandler } = jest.requireActual("react-native");
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, "addEventListener").mockImplementation((...args: unknown[]) => {
      handlers.push(args[1] as () => boolean);
      return { remove: () => undefined };
    });
    router.canGoBack.mockReturnValue(false);
    jest.spyOn(conversationsApi, "list").mockResolvedValue(empty);
    renderScreen();
    let handled = false;
    act(() => { handled = handlers.some((h) => h()); });
    expect(handled).toBe(true);
    expect(router.replace).toHaveBeenCalledWith("/home");
  });
});
