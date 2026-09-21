/**
 * Choosing a chat, and the half that was missing for a week.
 *
 * `docs/SESSION_PARITY.md`: the web's `selectSession` writes a local key AND
 * calls `activate`, because *"localStorage opens the right chat instantly in
 * this browser; the server is what makes the same chat open on the phone."*
 * Mobile had the local half only.
 *
 * ── WHY IT HID ───────────────────────────────────────────────────────────
 * `Ai::Sessions.current` is `remembered || list.first || create`, and only
 * two things write `user.data['ai_session_id']`: `activate`, and `ai#show`.
 * So the server was not never told — it was told **only when somebody asked
 * a question**. Every test, every flow and every manual check that switched a
 * chat and then said something saw correct behaviour. The symptom belongs to
 * the person who switches and then puts the phone down.
 *
 * That is why the assertion here is about the CALL rather than about any
 * visible state: nothing on this device changes either way, and the device
 * that would show the difference is a laptop.
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

/* eslint-disable import/first */
import Chat from "../chat";
import { aiApi, documentsApi, sessionsApi, type AiSession } from "@/api/ai";
import { useAuthStore } from "@/stores/auth.store";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";
import AsyncStorage from "@react-native-async-storage/async-storage";

let client: QueryClient | null = null;
let activate: jest.SpyInstance;

function session(id: number, title: string): AiSession {
  return {
    id, title, messageCount: 2, documentCount: 0,
    createdAt: "2026-09-01T09:00:00Z", updatedAt: new Date().toISOString(),
    instructions: null, apps: [],
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

/** Nothing can be switched until the current session has resolved. */
async function openSheet() {
  await waitFor(() =>
    expect(mockUseConversation).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 4 }),
    ),
  );
  fireEvent.press(screen.getByTestId("chat-open-sessions"));
  await waitFor(() => expect(screen.getByTestId("session-row-9")).toBeTruthy());
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useAuthStore.setState({
    user: { id: 2, email: "qa@example.test", firstName: "Qa", lastName: "Mobile", fullName: "Qa Mobile", avatar: null },
    status: "signedIn",
    signedOutReason: null,
  });
  mockUseConversation.mockReturnValue({
    messages: [], status: "ready", awaitingReply: false, failed: false,
    hasOlder: false, loadOlder: jest.fn(), addPending: jest.fn(),
    mergeMessage: jest.fn(), resync: jest.fn(),
  });
  jest.spyOn(aiApi, "currentSessionId").mockResolvedValue(4);
  jest.spyOn(documentsApi, "list").mockResolvedValue([]);
  jest.spyOn(sessionsApi, "list").mockResolvedValue([session(4, "Money"), session(9, "Renovation")]);
  activate = jest.spyOn(sessionsApi, "activate").mockResolvedValue(undefined);
});

afterEach(() => {
  client?.clear();
  client = null;
  jest.restoreAllMocks();
});

describe("choosing a chat", () => {
  it("tells the SERVER which one, not only this device", async () => {
    renderChat();
    await openSheet();

    fireEvent.press(screen.getByTestId("session-row-9"));

    await waitFor(() => expect(activate).toHaveBeenCalledWith(9));
  });

  it("still remembers it on this device", async () => {
    renderChat();
    await openSheet();

    fireEvent.press(screen.getByTestId("session-row-9"));

    // Both halves, because either alone is a device that disagrees with the
    // others: the local key without `activate` is what this commit fixes, and
    // `activate` without the local key would make every launch wait on a
    // round trip to learn something the phone already knew.
    await waitFor(async () =>
      expect(await AsyncStorage.getItem("mm:aiSession:v1:2")).toBe("9"),
    );
  });

  // ── THE FAILURE IS DELIBERATELY SILENT, SO ASSERT THAT IT IS ─────────────
  //
  // Matching the web, which does `activate(id).catch(() => undefined)`. The
  // local choice has already held; interrupting somebody who has just
  // switched chats to report a background sync failure is worse than the
  // stale default it prevents. Asserted because "swallowed on purpose" and
  // "swallowed by accident" look identical in the code and only one of them
  // survives a refactor.
  it("does not break the switch when the server cannot be told", async () => {
    activate.mockRejectedValue(new Error("offline"));
    renderChat();
    await openSheet();

    fireEvent.press(screen.getByTestId("session-row-9"));

    await waitFor(() => expect(activate).toHaveBeenCalledWith(9));
    // The composer is still there and the sheet has closed: the switch
    // happened, locally, exactly as it would have before this call existed.
    await waitFor(() => expect(screen.getByTestId("composer-input")).toBeTruthy());
    expect(await AsyncStorage.getItem("mm:aiSession:v1:2")).toBe("9");
  });
});
