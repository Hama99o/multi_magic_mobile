/**
 * `attach-error` — the last of the four screen-level error states, and the one
 * that was left because it is awkward.
 *
 * `qa/UNWALKED.md` §3 named four handles nothing had ever rendered.
 * `ai-keys-error`, `ai-keys-borrowed` and `profile-error` were closed last
 * night. This one was not, and the reason is worth stating: it cannot be
 * reached by stubbing the hook. `useAttachments` owns the refusal, so a stub
 * that hands the screen an error string proves the screen can render a string
 * it was handed — which is not the finding. **The picker is the seam**, so
 * these mock `expo-document-picker` and `expo-image-picker` and let the real
 * hook decide.
 *
 * ── WHAT THE DESIGN RULE ACTUALLY IS ─────────────────────────────────────
 * `docs/design/upload/SPEC.md`: the limits are **said before the request
 * fails**, not after. So the assertion is not only that a sentence appears —
 * it is that **no upload was attempted**. A screen that uploads a 12 MB file,
 * waits for the server to reject it and then shows the same words passes a
 * weaker test that reads identically, and costs somebody on a slow connection
 * a 12 MB upload to be told a rule the app already knew.
 *
 * That is why `documentsApi.upload` is spied on rather than mocked away: the
 * claim is about a boundary NOT being crossed, and the only way to assert that
 * is to watch the boundary.
 *
 * ── AND THE PERMISSION PATHS ARE A DIFFERENT SHAPE ───────────────────────
 * A refused permission is not a refused file. Nothing is wrong with what the
 * person chose — they were never allowed to choose — so the sentence names the
 * permission rather than the file, and there is nothing to retry until
 * Settings changes.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a) },
}));

const mockUseConversation = jest.fn();
jest.mock("@/hooks/useConversation", () => ({
  useConversation: (...a: unknown[]) => mockUseConversation(...a),
}));

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

/* eslint-disable import/first */
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import Chat from "../chat";
import { aiApi, documentsApi } from "@/api/ai";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

const picker = DocumentPicker as unknown as Record<string, jest.Mock>;
const images = ImagePicker as unknown as Record<string, jest.Mock>;

let client: QueryClient | null = null;
let upload: jest.SpyInstance;

/** One asset, shaped as `getDocumentAsync` hands it back. */
function document(over: Partial<{ name: string; size: number; mimeType: string }> = {}) {
  return {
    canceled: false,
    assets: [
      { name: "statement.pdf", size: 1024, mimeType: "application/pdf", uri: "file:///tmp/a", ...over },
    ],
  };
}

function renderChat() {
  client = testQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Chat />
    </QueryClientProvider>,
  );
}

/** Nothing can be attached until the session id resolves — the screen has no
 *  conversation to attach TO before that. */
async function waitForSession() {
  await waitFor(() =>
    expect(mockUseConversation).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 4 }),
    ),
  );
}

async function openAttachSheet() {
  await waitForSession();
  fireEvent.press(screen.getByTestId("composer-attach"));
  await waitFor(() => expect(screen.getByTestId("attach-sheet")).toBeTruthy());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseConversation.mockReturnValue({
    messages: [], status: "ready", awaitingReply: false, failed: false,
    hasOlder: false, loadOlder: jest.fn(), addPending: jest.fn(),
    mergeMessage: jest.fn(), resync: jest.fn(),
  });
  jest.spyOn(aiApi, "currentSessionId").mockResolvedValue(4);
  jest.spyOn(documentsApi, "list").mockResolvedValue([]);
  upload = jest.spyOn(documentsApi, "upload");
});

afterEach(() => {
  client?.clear();
  client = null;
  jest.restoreAllMocks();
});

describe("a file the app already knows it cannot take", () => {
  it("says the size limit WITHOUT uploading anything", async () => {
    picker.getDocumentAsync.mockResolvedValue(
      document({ name: "scan.pdf", size: 12 * 1024 * 1024 }),
    );
    renderChat();
    await openAttachSheet();

    fireEvent.press(screen.getByTestId("attach-document"));

    await waitFor(() => expect(screen.getByTestId("attach-error")).toBeTruthy());
    expect(screen.getByTestId("attach-error")).toHaveTextContent(/scan\.pdf/);
    expect(screen.getByTestId("attach-error")).toHaveTextContent(/under 10 MB/);

    // ── THE HALF THAT IS THE DESIGN RULE ─────────────────────────────────
    // The sentence alone would appear either way. This is the difference
    // between refusing a file and asking the server to refuse it.
    expect(upload).not.toHaveBeenCalled();
  });

  it("names the file type it cannot read, and still uploads nothing", async () => {
    picker.getDocumentAsync.mockResolvedValue(
      document({ name: "notes.pages", mimeType: "application/x-iwork" }),
    );
    renderChat();
    await openAttachSheet();

    fireEvent.press(screen.getByTestId("attach-document"));

    await waitFor(() =>
      expect(screen.getByTestId("attach-error")).toHaveTextContent(/notes\.pages/),
    );
    // The sentence says what it CAN read rather than only what it cannot.
    expect(screen.getByTestId("attach-error")).toHaveTextContent(/PDFs, images and CSVs/);
    expect(upload).not.toHaveBeenCalled();
  });

  it("stays quiet when the picker is dismissed", async () => {
    picker.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    renderChat();
    await openAttachSheet();

    fireEvent.press(screen.getByTestId("attach-document"));

    // Cancelling is not an error, and an error line after a cancel reads as
    // "something went wrong" for an action the person deliberately abandoned.
    await waitFor(() => expect(picker.getDocumentAsync).toHaveBeenCalled());
    expect(screen.queryByTestId("attach-error")).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("a permission the person never granted", () => {
  it("names the permission rather than the file", async () => {
    images.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });
    renderChat();
    await openAttachSheet();

    fireEvent.press(screen.getByTestId("attach-photo"));

    await waitFor(() =>
      expect(screen.getByTestId("attach-error")).toHaveTextContent(/permission to open your photos/),
    );
    // Nothing was chosen, so the library was never opened either.
    expect(images.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("says CAMERA when it is the camera, not photos", async () => {
    images.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
    renderChat();
    await openAttachSheet();

    fireEvent.press(screen.getByTestId("attach-camera"));

    // Two permissions, two sentences. One sentence for both would send
    // somebody to the wrong switch in Settings.
    await waitFor(() =>
      expect(screen.getByTestId("attach-error")).toHaveTextContent(/permission to use the camera/),
    );
    expect(images.launchCameraAsync).not.toHaveBeenCalled();
  });
});
