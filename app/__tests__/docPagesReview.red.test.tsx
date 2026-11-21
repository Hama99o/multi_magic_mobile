/**
 * REVIEW (multi-magic-mobile-88, 2026-11-21), two red tests against
 * feat/doc-tools 6f2d597. The owner fixes the code; these say what "fixed" is.
 *
 * F1. The page list Save sends is built from the thumbnails the server sent
 *     back (`entriesFor(thumbs.data.pages.length)`, app/doc/pages.tsx:57),
 *     not from `pageCount`. When the server truncates the thumbnails, which
 *     the client expects (`truncated`, "Only the first N pages are shown"),
 *     Save writes a PDF that silently lacks every page past the cap.
 *
 * F2. `useRetry().remember` (src/screens/doc/ui.tsx:281) keeps the closure of
 *     the render the call was made in, so Retry after a busy server sends the
 *     state from before the user's later edits.
 *
 * Invented values only.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import "react-native-gesture-handler/jestSetup";

import { http } from "@/api/http";
import { testQueryClient } from "@/__tests__/queryClient";
import PagesScreen from "../doc/pages";
import * as DocumentPicker from "expo-document-picker";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true, dismissTo: jest.fn() },
  useLocalSearchParams: () => ({}),
  usePathname: () => "/doc/pages",
  useFocusEffect: () => {},
}));
jest.mock("react-native-gesture-handler", () => ({
  ...jest.requireActual("react-native-gesture-handler"),
  GestureDetector: ({ children }: { children: unknown }) => children,
}));
jest.mock("@/lib/cable", () => ({ subscribeToChannel: () => () => {} }));
jest.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
    }
    create() {}
    static pickDirectoryAsync = jest.fn();
  }
  class File {
    uri: string;
    name: string;
    constructor(dir: { uri: string } | string, name?: string) {
      this.uri = typeof dir === "string" ? dir : `${dir.uri}/${name}`;
      this.name = name ?? this.uri.split("/").pop() ?? "";
    }
    create() {}
    write() {}
  }
  return { Directory, File, Paths: { cache: "file:///cache" }, FileMode: { ReadOnly: 0, WriteOnly: 1 } };
});
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

const PAGES_URL = "/api/v1/doc_app/pdf/pages";
let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(http);
  jest.spyOn(require("react-native").Dimensions, "get").mockReturnValue({ width: 360, height: 2400, scale: 3, fontScale: 1 });
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

function thumbs(pageCount: number, shown: number) {
  return { page_count: pageCount, truncated: shown < pageCount, pages: Array.from({ length: shown }, (_, index) => ({ index, width: 100, height: 130, data: "AAAA" })) };
}

/** The `pages` field of a posted FormData, parsed: Node's FormData has `get`, React Native's keeps `_parts`. */
function sentPages(body: unknown): { source: number; rotation: number }[] {
  const data = body as { get?: (k: string) => unknown; _parts?: [string, unknown][] };
  const value = typeof data.get === "function" ? data.get("pages") : data._parts?.find(([key]) => key === "pages")?.[1];
  if (value == null) throw new Error(`no "pages" field in the posted body: ${Object.prototype.toString.call(body)}`);
  return JSON.parse(String(value));
}

async function openPdf(pageCount: number, shown: number) {
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///cache/Report.pdf", name: "Report.pdf", mimeType: "application/pdf", size: 1000 }] });
  mock.onPost("/api/v1/doc_app/pdf/inspect").reply(200, { pdf: true, pages: pageCount, encrypted: false, reason: null, sizes: [] });
  mock.onPost("/api/v1/doc_app/pdf/thumbnails").reply(200, thumbs(pageCount, shown));
  render(
    <QueryClientProvider client={testQueryClient()}>
      <PagesScreen />
    </QueryClientProvider>,
  );
  fireEvent.press(await screen.findByTestId("doc-pages-intake-add"));
  fireEvent.press(await screen.findByTestId("doc-intake-files"));
  await screen.findByTestId("doc-pages-save", {}, { timeout: 3000 });
}

it("F1: Save keeps every page of a long PDF, not only the pages the server drew a thumbnail for", async () => {
  await openPdf(350, 300);
  mock.onPost(PAGES_URL).reply(200, new ArrayBuffer(8), { "content-type": "application/pdf" });
  fireEvent.press(screen.getByTestId("doc-pages-save"));
  await waitFor(() => expect(mock.history.post.filter((r) => r.url?.endsWith("/pdf/pages"))).toHaveLength(1), { timeout: 3000 });
  const sent = sentPages(mock.history.post.find((r) => r.url?.endsWith("/pdf/pages"))?.data);
  expect(sent).toHaveLength(350);
  expect(sent[349]).toEqual({ source: 349, rotation: 0 });
});

it("F2: Retry after a busy server sends the pages as they are now, with the turn made after the error", async () => {
  await openPdf(3, 3);
  mock
    .onPost(PAGES_URL)
    .replyOnce(503, { reason: "busy", message: "Another document is being processed." })
    .onPost(PAGES_URL)
    .reply(200, new ArrayBuffer(8), { "content-type": "application/pdf" });

  fireEvent.press(screen.getByTestId("doc-pages-save"));
  await screen.findByTestId("doc-error-retry", {}, { timeout: 3000 });

  // The grid draws its cells once it knows its own width.
  act(() => {
    fireEvent(screen.getByTestId("doc-pages-grid"), "layout", { nativeEvent: { layout: { width: 320, height: 800, x: 0, y: 0 } } });
  });
  // While the error is up, turn page 1 to the right.
  fireEvent.press(await screen.findByTestId("doc-page-1"));
  fireEvent.press(await screen.findByTestId("doc-pages-rotate-right"));

  fireEvent.press(screen.getByTestId("doc-error-retry"));
  await waitFor(() => expect(mock.history.post.filter((r) => r.url?.endsWith("/pdf/pages"))).toHaveLength(2), { timeout: 3000 });
  const retried = sentPages(mock.history.post.filter((r) => r.url?.endsWith("/pdf/pages"))[1].data);
  expect(retried[0]).toEqual({ source: 0, rotation: 90 });
});
