/**
 * A DOC TOOL'S UNSAVED WORK IS NOT DROPPED WITHOUT ASKING (review 88, D3, 2026-11-21).
 *
 * On Pages, Text and Sign, "Change" (another file) and Back threw away the pages turned,
 * the text edited or the signatures placed, without a word. With work in progress both
 * now ask first (`useKeepUnsaved`, src/screens/doc/ui.tsx). Driven here on Pages.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import "react-native-gesture-handler/jestSetup";
import { Alert } from "react-native";

import { http } from "@/api/http";
import { testQueryClient } from "@/__tests__/queryClient";
import PagesScreen from "../doc/pages";
import * as DocumentPicker from "expo-document-picker";

const mockNav: { listener: ((e: any) => void) | null; dispatch: jest.Mock } = { listener: null, dispatch: jest.fn() };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true, dismissTo: jest.fn() },
  useNavigation: () => ({
    addListener: (_n: string, fn: (e: any) => void) => {
      mockNav.listener = fn;
      return () => {
        if (mockNav.listener === fn) mockNav.listener = null;
      };
    },
    dispatch: mockNav.dispatch,
  }),
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


async function turnFirstPage() {
  act(() => {
    fireEvent(screen.getByTestId("doc-pages-grid"), "layout", { nativeEvent: { layout: { width: 320, height: 800, x: 0, y: 0 } } });
  });
  fireEvent.press(await screen.findByTestId("doc-page-1"));
  fireEvent.press(await screen.findByTestId("doc-pages-rotate-right"));
}

beforeEach(() => {
  mockNav.dispatch.mockReset();
});

it("with a page turned, Change asks before another file replaces the work", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  await openPdf(3, 3);
  await turnFirstPage();
  fireEvent.press(screen.getByTestId("doc-pages-change"));
  expect(alert).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId("doc-intake-sheet")).toBeNull();
});

it("with a page turned, Back or a swipe stops and asks; Leave goes", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  await openPdf(3, 3);
  await turnFirstPage();
  const event = { preventDefault: jest.fn(), data: { action: { type: "GO_BACK" } } };
  await act(async () => {
    mockNav.listener?.(event);
  });
  expect(event.preventDefault).toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2] as { style?: string; onPress?: () => void }[];
  act(() => buttons.find((b) => b.style === "destructive")!.onPress!());
  expect(mockNav.dispatch).toHaveBeenCalledWith({ type: "GO_BACK" });
});

it("with nothing changed, Change opens the file sheet at once", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  await openPdf(3, 3);
  fireEvent.press(screen.getByTestId("doc-pages-change"));
  expect(alert).not.toHaveBeenCalled();
  expect(await screen.findByTestId("doc-intake-sheet")).toBeTruthy();
});
