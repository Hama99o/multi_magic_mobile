/**
 * The versions sheet (parity #37, #39): the list, who may restore or delete,
 * and a confirm before either. Invented values only.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { testQueryClient } from "@/__tests__/queryClient";
import { http } from "@/api/http";
import type { PageNode } from "@/api/pages";
import { VersionsSheet } from "../VersionsSheet";

const node = { id: 9, spaceId: 3, parentId: null, title: "Budget.xlsx", kind: "file", starred: false, childrenCount: 0, attachmentUrl: "https://files.example.test/b.xlsx", thumbnailUrl: null, mimeType: "application/vnd.ms-excel", fileSize: 10, ownerName: null, updatedAt: "2026-11-20T21:00:00Z", createdAt: null, deletedAt: null, space: null, html: null, ancestors: [] } as PageNode;

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
  mock.onGet("/api/v1/page_app/spaces/3/nodes/9/versions").reply(200, {
    versions: [{ id: 1, created_at: "2026-11-01T10:00:00Z", byte_size: 100, content_type: "text/plain", filename: "a.txt", url: "/x/a.txt", created_by: { id: 2, fullname: "Ada" } }],
  });
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

const show = (canWrite: boolean) =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <VersionsSheet node={node} canWrite={canWrite} onClose={jest.fn()} />
    </QueryClientProvider>,
  );

it("lists the earlier versions; an editor may upload, restore and delete", async () => {
  show(true);
  expect(await screen.findAllByTestId("pages-version-row")).toHaveLength(1);
  expect(screen.getByTestId("pages-versions-upload")).toBeTruthy();
  expect(screen.getByTestId("pages-version-restore-1")).toBeTruthy();
  expect(screen.getByTestId("pages-version-delete-1")).toBeTruthy();
});

it("a viewer sees the versions and may open them, nothing that writes", async () => {
  show(false);
  expect(await screen.findAllByTestId("pages-version-row")).toHaveLength(1);
  expect(screen.getByTestId("pages-version-open-1")).toBeTruthy();
  expect(screen.queryByTestId("pages-versions-upload")).toBeNull();
  expect(screen.queryByTestId("pages-version-restore-1")).toBeNull();
  expect(screen.queryByTestId("pages-version-delete-1")).toBeNull();
});

it("delete asks first and sends nothing until confirmed", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  show(true);
  fireEvent.press(await screen.findByTestId("pages-version-delete-1"));
  expect(alert).toHaveBeenCalledWith("Delete this version?", expect.any(String), expect.any(Array));
  expect(mock.history.delete).toHaveLength(0);
});
