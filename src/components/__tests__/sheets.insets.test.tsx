/**
 * EVERY BOTTOM SHEET, ABOVE THE HOME INDICATOR — one table, no branches.
 *
 * On every iPhone since the X the bottom safe-area inset is 34 pt, and on
 * Android with edge-to-edge the gesture bar is a comparable strip. A sheet that
 * pads its bottom by a fixed 16 or 24 puts its LAST row under that strip —
 * which for the sessions sheet is "Sign out", and for a preview is the one
 * button on it. AttachSheet's own comment records the measurement on a device;
 * this table makes the rule hold for the other five without another device.
 *
 * Insets come from a real `SafeAreaProvider` with iPhone 15 metrics rather
 * than from a mock of the hook, so a sheet that forgets to call the hook fails
 * here for the right reason.
 */
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
}));

/* eslint-disable import/first */
import { AttachSheet } from "@/components/chat/AttachSheet";
import { FilePreview } from "@/components/chat/FilePreview";
import { SourceSheet } from "@/components/chat/SourceSheet";
import { SessionsSheet } from "@/components/sessions/SessionsSheet";
import { PhotoSheet } from "@/screens/account/PhotoSheet";
import { ReactionSheet } from "@/screens/people/ReactionSheet";
import { sessionsApi, type ChatMessage } from "@/api/ai";

/** iPhone 15: 59 pt under the Dynamic Island, 34 pt over the home indicator. */
const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, bottom: 34, left: 0, right: 0 },
};

const MESSAGE: ChatMessage = {
  id: 1, conversationId: 4, role: "user", body: "hello", createdAt: "2026-09-18T10:00:00Z",
  deleted: false, userId: 2, sentByMe: true, editedAt: null, readAt: null,
  reactions: [], links: [], sources: [], undoable: false, undoneAt: null,
};

const noop = () => {};

/** One WRITTEN row per sheet: its handle and how to open it. */
const SHEETS: { name: string; testID: string; element: () => ReactElement }[] = [
  {
    name: "attach",
    testID: "attach-sheet",
    element: () => (
      <AttachSheet visible fileCount={0} onClose={noop} onPickImage={noop} onTakePhoto={noop} onPickDocument={noop} />
    ),
  },
  {
    name: "photo",
    testID: "photo-sheet",
    element: () => <PhotoSheet visible hasPhoto onPicked={noop} onRemove={noop} onClose={noop} />,
  },
  {
    name: "reaction",
    testID: "reaction-sheet",
    element: () => (
      <ReactionSheet message={MESSAGE} onReact={noop} onCopy={noop} onEdit={noop} onDelete={noop} onClose={noop} />
    ),
  },
  {
    name: "sessions",
    testID: "sessions-sheet",
    element: () => <SessionsSheet visible activeId={null} onClose={noop} onOpenSession={noop} onSignOut={noop} />,
  },
  {
    name: "source",
    testID: "source-sheet",
    element: () => <SourceSheet source={{ label: "Loan to Ahmad", path: "/loans/3", key: "loan" }} onClose={noop} />,
  },
  {
    name: "file preview",
    testID: "file-preview",
    element: () => <FilePreview link={{ label: "lease.pdf", url: "https://example.test/lease.pdf" }} onClose={noop} />,
  },
];

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  jest.spyOn(sessionsApi, "list").mockResolvedValue([]);
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe.each(SHEETS)("the $name sheet", ({ testID, element }) => {
  it("pads its bottom by at least the home indicator", async () => {
    render(
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={IPHONE}>{element()}</SafeAreaProvider>
      </QueryClientProvider>,
    );

    const sheet = await screen.findByTestId(testID);
    const style = StyleSheet.flatten(sheet.props.style) as { paddingBottom?: number; padding?: number };
    const bottom = style.paddingBottom ?? style.padding ?? 0;

    expect(bottom).toBeGreaterThanOrEqual(IPHONE.insets.bottom);
  });
});
