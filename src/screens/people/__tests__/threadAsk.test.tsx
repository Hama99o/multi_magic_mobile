/**
 * "Ask the assistant" from a thread with a person (parity audit, Chats, old P2, 2026-11-21). The
 * question is COMPOSED in the assistant's box and not sent, so the person can change it first (the
 * app's rule, `useAsk`). The thread's name is the person's, as the header shows it.
 */
import MockAdapter from "axios-mock-adapter";
import { fireEvent, screen } from "@testing-library/react-native";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { journey, serveApi } from "@/__tests__/journey";
import Thread from "../../../../app/chat/[id]";

jest.mock("expo-router", () => require("@/__tests__/screenMocks").expoRouter);
jest.mock("expo-clipboard", () => require("@/__tests__/screenMocks").clipboard);
jest.mock("expo-haptics", () => require("@/__tests__/screenMocks").haptics);
jest.mock("expo-linking", () => require("@/__tests__/screenMocks").linking);
jest.mock("expo-image-picker", () => require("@/__tests__/screenMocks").imagePicker);
jest.mock("@/lib/cable", () => require("@/__tests__/screenMocks").cable);
const mockAsk = jest.fn();
jest.mock("@/screens/flow/useAsk", () => ({ useAsk: () => mockAsk }));

let mock: MockAdapter;
let j: ReturnType<typeof journey>;
beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mockAsk.mockClear();
  j = journey();
  serveApi(mock);
});
afterEach(() => {
  j.end();
  mock.restore();
});

it("the thread's header asks the assistant about this conversation, composed and not sent", async () => {
  await i18n.changeLanguage("en");
  j.visit(<Thread />);
  const button = await screen.findByTestId("thread-ask");
  expect(button.props.accessibilityLabel).toBe("Ask the assistant about this conversation");
  fireEvent.press(button);
  expect(mockAsk).toHaveBeenCalledWith("About my conversation with Qa MOBILE: ");
});

it("in French too", async () => {
  await i18n.changeLanguage("fr");
  j.visit(<Thread />);
  fireEvent.press(await screen.findByTestId("thread-ask"));
  expect(mockAsk).toHaveBeenCalledWith("À propos de ma conversation avec Qa MOBILE : ");
});
