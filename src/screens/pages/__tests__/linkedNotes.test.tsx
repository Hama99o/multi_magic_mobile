/**
 * Linked notes (parity #26, #51): the list, who may link and unlink, and a
 * note already linked cannot be linked twice. Invented values only.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { testQueryClient } from "@/__tests__/queryClient";
import { http } from "@/api/http";
import type { PageNode } from "@/api/pages";
import { LinkedNotesSheet } from "../LinkedNotesSheet";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const node = { id: 9, spaceId: 3, parentId: null, title: "Trip", kind: "folder", starred: false, childrenCount: 0, attachmentUrl: null, thumbnailUrl: null, mimeType: null, fileSize: null, ownerName: null, updatedAt: "2026-11-20T21:00:00Z", createdAt: null, deletedAt: null, space: null, html: null, ancestors: [] } as PageNode;
const note = (id: number, title: string) => ({ id, title, data: {}, content: "", status: "active", created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z" });

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
  mock.onGet("/api/v1/page_app/spaces/3/nodes/9/note_links").reply(200, { note_links: [{ id: 1, position: 0, note_app_note_id: 10, note: { id: 10, title: "Packing list" } }] });
  mock.onGet(/\/api\/v1\/note_app\/notes/).reply(200, { notes: [note(10, "Packing list"), note(11, "Hotels")], meta: { pagy: { page: 1, pages: 1 }, total_count: 2 } });
});
afterEach(() => mock.restore());

const show = (canWrite: boolean) =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <LinkedNotesSheet node={node} canWrite={canWrite} onClose={jest.fn()} />
    </QueryClientProvider>,
  );

it("a viewer sees the linked notes and can open them; nothing that links or unlinks", async () => {
  show(false);
  expect(await screen.findByTestId("pages-notes-open-10")).toBeTruthy();
  expect(screen.queryByTestId("pages-notes-link")).toBeNull();
  expect(screen.queryByTestId("pages-notes-unlink-10")).toBeNull();
});

it("an editor links a note at the end; a note already linked is marked and cannot be linked again", async () => {
  mock.onPost("/api/v1/page_app/spaces/3/nodes/9/note_links").reply(201, { note_link: { id: 2, position: 1, note_app_note_id: 11, note: { id: 11, title: "Hotels" } } });
  show(true);
  fireEvent.press(await screen.findByTestId("pages-notes-link"));
  const already = await screen.findByTestId("pages-notes-pick-10");
  expect(already.props.accessibilityState).toMatchObject({ disabled: true });
  fireEvent.press(screen.getByTestId("pages-notes-pick-11"));
  await waitFor(() => expect(mock.history.post).toHaveLength(1));
  expect(JSON.parse(mock.history.post[0].data)).toEqual({ note_id: 11, position: 1 });
});

// Measured 2026-11-21 on qa_phone (flow 34): the picker's search field opens
// the keyboard (autoFocus), and the whole sheet sat behind it: a Pages
// BottomSheet is a Modal, and an edge-to-edge Android window is not resized
// for the IME (docs/TESTING.md §5). KeyboardPadding is the app's lift.
it("the picker rises with the keyboard (the sheet is inside KeyboardPadding)", async () => {
  const { KeyboardPadding } = jest.requireActual("@/components/KeyboardPadding");
  show(true);
  fireEvent.press(await screen.findByTestId("pages-notes-link"));
  const search = await screen.findByTestId("pages-notes-search");
  const lifted = screen.UNSAFE_getAllByType(KeyboardPadding);
  expect(lifted.some((k) => within(k).queryByTestId("pages-notes-search") === search)).toBe(true);
});
