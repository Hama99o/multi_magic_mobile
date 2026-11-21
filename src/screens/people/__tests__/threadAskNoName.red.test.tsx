/**
 * REVIEW (ee, 2026-11-21) of feat/chats-ask 7773bdd: "ask the assistant" from a thread opened
 * WITHOUT a name in its route. `src/lib/inAppRoute.ts:113` (a notification, an in-app link) opens
 * a thread with `{ id }` only. The header then shows the conversation's own name
 * (`detail?.displayName ?? title`, app/chat/[id].tsx:799), but the Ask button composes from
 * `title`, the route param, whose fallback is t("thread.chat"): "About my conversation with
 * Chat: ", which names nobody, so the assistant cannot tell which conversation he means.
 */
import fs from "fs";
import path from "path";
import MockAdapter from "axios-mock-adapter";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { journey, serveApi } from "@/__tests__/journey";
import Thread from "../../../../app/chat/[id]";

jest.mock("expo-router", () => ({
  ...jest.requireActual("@/__tests__/screenMocks").expoRouter,
  // As inAppRoute.ts:113 opens it: the id, no name.
  useLocalSearchParams: () => ({ id: "266" }),
}));
jest.mock("expo-clipboard", () => require("@/__tests__/screenMocks").clipboard);
jest.mock("expo-haptics", () => require("@/__tests__/screenMocks").haptics);
jest.mock("expo-linking", () => require("@/__tests__/screenMocks").linking);
jest.mock("expo-image-picker", () => require("@/__tests__/screenMocks").imagePicker);
jest.mock("@/lib/cable", () => require("@/__tests__/screenMocks").cable);
const mockAsk = jest.fn();
jest.mock("@/screens/flow/useAsk", () => ({ useAsk: () => mockAsk }));

let mock: MockAdapter;
let j: ReturnType<typeof journey>;
beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mockAsk.mockClear();
  j = journey();
  // The thread's own detail (conversationsApi.show), from the captured list row 266: the header
  // reads its name from it. serveApi does not serve it, so it is served here, before serveApi.
  const page = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../api/__tests__/fixtures/conversations_page1.json"), "utf8"));
  const row = (page.body ?? page).conversations.find((c: { id: number }) => c.id === 266);
  mock.onGet(/\/conversations\/266$/).reply(200, { conversation: row });
  serveApi(mock);
});
afterEach(() => {
  j.end();
  mock.restore();
});

it("opened from a notification (no name in the route), Ask names the person the header shows, not \"Chat\"", async () => {
  await i18n.changeLanguage("en");
  j.visit(<Thread />);
  await waitFor(() => expect(mock.history.get.some((r) => /\/conversations\/266$/.test(r.url ?? ""))).toBe(true));
  // The header now shows the conversation's own name (app/chat/[id].tsx:799), not the fallback.
  await waitFor(() => expect(screen.queryByText("Chat")).toBeNull());
  fireEvent.press(await screen.findByTestId("thread-ask"));
  expect(mockAsk).toHaveBeenCalledTimes(1);
  expect(mockAsk).not.toHaveBeenCalledWith("About my conversation with Chat: ");
});
