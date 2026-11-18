/**
 * One contact document, opened (audit #8): the Pages viewer's own pieces,
 * by what the file is. The web's `ContactDocumentPreview.tsx` steps through
 * the contact's documents and offers Download; here the images swipe in the
 * Pages gallery, a PDF opens as Pages opens one, and Share hands the file
 * to the phone (the Pages viewer's Download). Invented fixtures.
 */
import MockAdapter from "axios-mock-adapter";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { router as mockedRouter } from "expo-router";

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
}));
jest.mock("react-native-webview", () => ({ WebView: () => null }));
jest.mock("@/screens/pages/ItemSheet", () => ({ ...jest.requireActual("@/screens/pages/ItemSheet"), shareNode: jest.fn(async () => undefined) }));
jest.mock("@/api/pages", () => ({ ...jest.requireActual("@/api/pages"), downloadToCache: jest.fn(async () => "file:///cache/x.pdf") }));

/* eslint-disable import/first */
import ContactDocumentScreen from "../../../../app/contacts/document";
import { shareNode } from "@/screens/pages/ItemSheet";

const router = mockedRouter as unknown as { back: jest.Mock };
const BASE = "/api/v1/contact_app/contacts";
let mock: MockAdapter;

const doc = (id: number, filename: string, contentType = "image/jpeg") => ({
  id, filename, byte_size: 50_000, content_type: contentType,
  url: `/rails/active_storage/blobs/proxy/d${id}/${filename}`, thumbnail_url: null,
});
const card = (documents: unknown[]) => ({
  contact: {
    id: 7, firstname: "Nadia", lastname: "Rahimi", nickname: null, company: null, job_title: null, favorite: false,
    birth_date: null, age: null, photo_url: null, is_self: false, phones: [], emails: [], addresses: [], relations: [],
    website: null, notes: null, documents,
  },
});

function renderScreen() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <ContactDocumentScreen />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
  router.back.mockClear();
  (shareNode as jest.Mock).mockClear();
});
afterEach(() => mock.restore());

it("an image opens in the Pages gallery, among this contact's images only", async () => {
  mockParams.current = { contactId: "7", documentId: "3" };
  mock.onGet(`${BASE}/7`).reply(200, card([doc(2, "front.jpg"), doc(3, "back.jpg"), doc(4, "lease.pdf", "application/pdf")]));
  renderScreen();
  fireEvent(await screen.findByTestId("pages-gallery"), "layout", { nativeEvent: { layout: { width: 360, height: 600 } } });
  // Newest first, as the card lists them: back (3), then front (2).
  expect(screen.getByText("1 of 2")).toBeTruthy();
  expect(screen.getByText("back.jpg")).toBeTruthy();
});

it("a PDF opens as Pages opens one", async () => {
  mockParams.current = { contactId: "7", documentId: "4" };
  mock.onGet(`${BASE}/7`).reply(200, card([doc(4, "lease.pdf", "application/pdf")]));
  renderScreen();
  expect(await screen.findByTestId(/^contact-document-view-(document|pdf)$/)).toBeTruthy();
  expect(screen.getByText("lease.pdf")).toBeTruthy();
});

it("Share hands the file to the phone through the Pages share", async () => {
  mockParams.current = { contactId: "7", documentId: "4" };
  mock.onGet(`${BASE}/7`).reply(200, card([doc(4, "lease.pdf", "application/pdf")]));
  renderScreen();
  fireEvent.press(await screen.findByTestId("contact-document-share"));
  await waitFor(() => expect(shareNode).toHaveBeenCalledWith(expect.objectContaining({ id: 4, title: "lease.pdf", mimeType: "application/pdf" })));
  expect((shareNode as jest.Mock).mock.calls[0][0].attachmentUrl).toMatch(/^https?:\/\/.+\/d4\/lease\.pdf$/);
});

it("a document deleted meanwhile says so and offers Back", async () => {
  mockParams.current = { contactId: "7", documentId: "99" };
  mock.onGet(`${BASE}/7`).reply(200, card([doc(4, "lease.pdf", "application/pdf")]));
  renderScreen();
  expect(await screen.findByText("This document is no longer here.")).toBeTruthy();
  fireEvent.press(screen.getByText("Back"));
  expect(router.back).toHaveBeenCalled();
});

it("a failed load says so and retries", async () => {
  mockParams.current = { contactId: "7", documentId: "4" };
  let calls = 0;
  mock.onGet(`${BASE}/7`).reply(() => (++calls === 1 ? [500, {}] : [200, card([doc(4, "lease.pdf", "application/pdf")])]));
  renderScreen();
  expect(await screen.findByTestId("contact-document-failed")).toBeTruthy();
  fireEvent.press(screen.getByText("Try again"));
  expect(await screen.findByText("lease.pdf")).toBeTruthy();
});
