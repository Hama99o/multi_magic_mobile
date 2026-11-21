/**
 * ONE NOTE, read-only (app/notes/note.tsx): the trash opens here, as on the
 * web, so its Restore and Delete forever belong here too (web Show.tsx
 * :313-325; parity #29). Seeded, invented notes only.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { Alert } from "react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() }, useLocalSearchParams: () => ({ id: "30" }) }));

/* eslint-disable import/first */
import NoteScreen from "../notes/note";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";

const mockRouter = jest.requireMock("expo-router").router as Record<"push" | "back" | "replace", jest.Mock>;

const note = (over: Record<string, unknown> = {}) => ({
  id: 30, title: "Trashed seed", description: "<p>gone soon</p>", data: {}, status: "trashed", pinned: false,
  created_at: "2026-11-01T10:00:00Z", deleted_at: null, updated_at: "2026-11-12T09:00:00Z",
  is_shared: false, role: "owner", shared_users: [], shared_count: 0, tags: [], ...over,
});

let mock: MockAdapter;
let server: ReturnType<typeof note>;
beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  Object.values(mockRouter).forEach((f) => f.mockClear());
  server = note();
  mock.onGet("/api/v1/note_app/notes/30").reply(() => [200, { note: server }]);
  mock.onGet("/api/v1/note_app/notes/30/note_links").reply(200, { note_links: [] });
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

const open = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <NoteScreen />
    </QueryClientProvider>,
  );

it("a trashed note says it is in the trash, and Restore brings it back", async () => {
  mock.onPut("/api/v1/note_app/notes/30/restore").reply(() => {
    server = note({ status: "published" });
    return [200, {}];
  });
  open();
  expect(await screen.findByTestId("note-trashed")).toBeTruthy();
  fireEvent.press(screen.getByTestId("note-restore"));
  await waitFor(() => expect(mock.history.put.map((r) => r.url)).toEqual(["/api/v1/note_app/notes/30/restore"]));
  await waitFor(() => expect(screen.queryByTestId("note-trashed")).toBeNull());
});

it("Delete forever asks first, then deletes and goes back", async () => {
  const alert = jest.spyOn(Alert, "alert");
  mock.onDelete("/api/v1/note_app/notes/30/destroy_permanently").reply(200, {});
  open();
  fireEvent.press(await screen.findByTestId("note-forever"));
  expect(mock.history.delete).toHaveLength(0);
  expect(alert.mock.calls[0][0]).toMatch(/forever/i);
  const buttons = alert.mock.calls[0][2] as { style?: string; onPress?: () => void }[];
  act(() => {
    buttons.find((b) => b.style === "destructive")!.onPress!();
  });
  await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toEqual(["/api/v1/note_app/notes/30/destroy_permanently"]));
  await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
});

it("a note shared with me in the trash has neither (the owner's call, as on the web)", async () => {
  server = note({ role: "contributor", is_shared: true });
  open();
  await screen.findByTestId("note-title");
  expect(screen.queryByTestId("note-restore")).toBeNull();
  expect(screen.queryByTestId("note-forever")).toBeNull();
});

it("a published note has neither", async () => {
  server = note({ status: "published" });
  open();
  await screen.findByTestId("note-title");
  expect(screen.queryByTestId("note-trashed")).toBeNull();
  expect(screen.queryByTestId("note-restore")).toBeNull();
});
