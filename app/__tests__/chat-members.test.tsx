/**
 * A group's members (audit #30), after the web's MembersPanel: everybody sees
 * who is in it and who administers it; only a group's admins add, remove and
 * promote, because the server refuses everybody else (`conversation_policy.rb`
 * `update?`). Removing is confirmed.
 */
import MockAdapter from "axios-mock-adapter";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { Alert } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ id: "80", name: "Trip", isGroup: "1", unread: "0" }),
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" } }));
jest.mock("@/lib/cable", () => ({ subscribeToChannel: () => () => {}, performOnChannel: () => false }));

/* eslint-disable import/first */
import Thread from "../chat/[id]";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";

const user = (id: number, fullname: string) => ({ id, fullname, email: `${fullname.split(" ")[0].toLowerCase()}@example.test`, avatar: null, is_online: false });
const me = user(1, "Hama Test");
const anisa = user(2, "Anisa Rahimi");
const sam = user(3, "Sam Doe");

function group(over: Record<string, unknown> = {}) {
  return {
    id: 80, created_at: "2026-11-01T09:00:00.000Z", updated_at: "2026-11-16T09:00:00.000Z", title: "Trip",
    is_group: true, can_delete: true, is_admin: true, user: { fullname: "Trip", is_online: false },
    participants: [
      { user: me, is_admin: true, last_read_at: null },
      { user: anisa, is_admin: false, last_read_at: null },
    ],
    last_message: null, unread_messages_count: 0, ...over,
  };
}

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mock.onGet("/api/v1/conversations/80/messages").reply(200, { messages: [], meta: { pagy: { pages: 1 } } });
  mock.onPost("/api/v1/conversations/80/mark_read").reply(200, { conversation: group() });
  mock.onGet("/api/v1/users/global_users").reply(200, { users: [anisa, sam], meta: { pagy: { pages: 1 } } });
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

function renderThread() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <Thread />
    </QueryClientProvider>,
  );
}

async function openMembers() {
  renderThread();
  fireEvent.press(await screen.findByLabelText("Members"));
  return screen.findByTestId("members-sheet");
}

it("a direct chat has no members button", async () => {
  mock.onGet("/api/v1/conversations/80").reply(200, { conversation: group({ is_group: false }) });
  renderThread();
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  expect(screen.queryByLabelText("Members")).toBeNull();
});

it("everybody sees the members and who is an admin; a non-admin gets no controls", async () => {
  mock.onGet("/api/v1/conversations/80").reply(200, { conversation: group({ is_admin: false, can_delete: false }) });
  const sheet = await openMembers();
  expect(within(sheet).getByText("Anisa Rahimi")).toBeTruthy();
  expect(within(sheet).getByTestId("member-1-admin")).toBeTruthy();
  expect(within(sheet).queryByTestId("member-2-admin")).toBeNull();
  expect(within(sheet).queryByLabelText("Remove Anisa Rahimi from the group")).toBeNull();
  expect(within(sheet).queryByLabelText("Make Anisa Rahimi an admin")).toBeNull();
  expect(within(sheet).queryByText("Add someone")).toBeNull();
});

it("an admin makes a member an admin", async () => {
  mock.onGet("/api/v1/conversations/80").reply(200, { conversation: group() });
  mock.onPut("/api/v1/conversations/80").reply(200, {
    conversation: group({ participants: [{ user: me, is_admin: true, last_read_at: null }, { user: anisa, is_admin: true, last_read_at: null }] }),
  });
  const sheet = await openMembers();
  fireEvent.press(within(sheet).getByLabelText("Make Anisa Rahimi an admin"));
  await waitFor(() => expect(mock.history.put).toHaveLength(1));
  expect(JSON.parse(mock.history.put[0].data)).toEqual({ user_id: 2, is_admin: true });
  expect(await screen.findByTestId("member-2-admin")).toBeTruthy();
  // Another admin is never offered a control: the web offers none, and the
  // server will not remove the last one.
  expect(screen.queryByLabelText("Remove Anisa Rahimi from the group")).toBeNull();
});

it("removing is confirmed, then the member leaves the list", async () => {
  mock.onGet("/api/v1/conversations/80").reply(200, { conversation: group() });
  mock.onPut("/api/v1/conversations/80").reply(200, { conversation: group({ participants: [{ user: me, is_admin: true, last_read_at: null }] }) });
  const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === "destructive")?.onPress?.();
  });
  const sheet = await openMembers();
  fireEvent.press(within(sheet).getByLabelText("Remove Anisa Rahimi from the group"));
  expect(alert.mock.calls[0][0]).toBe("Remove Anisa Rahimi?");
  await waitFor(() => expect(mock.history.put).toHaveLength(1));
  expect(JSON.parse(mock.history.put[0].data)).toEqual({ user_id: 2, remove: true });
  await waitFor(() => expect(screen.queryByText("Anisa Rahimi")).toBeNull());
});

it("cancelling the confirm removes nobody", async () => {
  mock.onGet("/api/v1/conversations/80").reply(200, { conversation: group() });
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  const sheet = await openMembers();
  fireEvent.press(within(sheet).getByLabelText("Remove Anisa Rahimi from the group"));
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  expect(mock.history.put).toHaveLength(0);
});

it("an admin adds somebody from the people picker, members left out of it", async () => {
  mock.onGet("/api/v1/conversations/80").reply(200, { conversation: group() });
  mock.onPut("/api/v1/conversations/80").reply(200, {
    conversation: group({ participants: [...group().participants, { user: sam, is_admin: false, last_read_at: null }] }),
  });
  const sheet = await openMembers();
  fireEvent.press(within(sheet).getByText("Add someone"));
  fireEvent.press(await screen.findByTestId("person-3"));
  // Anisa is in the group already.
  expect(screen.queryByTestId("person-2")).toBeNull();
  await waitFor(() => expect(mock.history.put).toHaveLength(1));
  expect(JSON.parse(mock.history.put[0].data)).toEqual({ user_id: 3 });
  // Back on the list, with the new member in it.
  expect(await screen.findByText("Sam Doe")).toBeTruthy();
  expect(screen.queryByTestId("members-add-search")).toBeNull();
});

it("a refusal is said, and the list stays as it was", async () => {
  mock.onGet("/api/v1/conversations/80").reply(200, { conversation: group() });
  mock.onPut("/api/v1/conversations/80").reply(403, { error: "Only an admin can do that" });
  const sheet = await openMembers();
  fireEvent.press(within(sheet).getByLabelText("Make Anisa Rahimi an admin"));
  expect(await screen.findByTestId("members-error")).toBeTruthy();
  expect(screen.queryByTestId("member-2-admin")).toBeNull();
});

it("the add picker rises with the keyboard: the sheet is inside KeyboardPadding", async () => {
  const { KeyboardPadding } = jest.requireActual("@/components/KeyboardPadding");
  mock.onGet("/api/v1/conversations/80").reply(200, { conversation: group() });
  const sheet = await openMembers();
  type Node = { type: unknown; parent: Node | null };
  let inside = false;
  for (let node = sheet as unknown as Node | null; node; node = node.parent) {
    if (node.type === KeyboardPadding) inside = true;
  }
  expect(inside).toBe(true);
});
