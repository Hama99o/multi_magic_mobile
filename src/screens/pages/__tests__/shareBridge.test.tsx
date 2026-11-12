/**
 * The share door's router (owner, 2026-11-12): a contact card goes to
 * Contacts, several to the bulk import, a number in a text to "add as a
 * contact", files to Pages as before, and a plain sentence nowhere.
 */
import { render, waitFor } from "@testing-library/react-native";
import { router as mockedRouter, usePathname } from "expo-router";
import { ShareIntentBridge } from "../ShareIntentBridge";
import { useAuthStore } from "@/stores/auth.store";
import { useSharedIntoContacts } from "@/stores/sharedIntoContacts.store";
import { usePendingImport } from "../addFiles";

const mockIntent: { current: { files: unknown[] | null; text: string | null } } = { current: { files: null, text: null } };
const mockReset = jest.fn();
jest.mock("@/lib/shareIntent", () => ({
  useShareIntentContext: () => ({
    hasShareIntent: Boolean(mockIntent.current.files?.length || mockIntent.current.text),
    shareIntent: { ...mockIntent.current, webUrl: null, type: null, meta: null },
    resetShareIntent: mockReset,
  }),
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() }, usePathname: jest.fn(() => "/home") }));
jest.mock("expo-file-system", () => {
  const files = new Map<string, string>();
  class File {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    async text() {
      return files.get(this.uri) ?? "";
    }
  }
  return { File, Paths: { cache: { uri: "file:///cache" } }, __files: files };
});

const router = mockedRouter as unknown as { push: jest.Mock; replace: jest.Mock };
const fs = jest.requireMock("expo-file-system") as { __files: Map<string, string> };
const card = (n: string) => `BEGIN:VCARD\r\nVERSION:3.0\r\nN:;${n};;;\r\nTEL:0701234567\r\nEND:VCARD\r\n`;

beforeEach(() => {
  router.push.mockClear();
  router.replace.mockClear();
  mockReset.mockClear();
  (usePathname as jest.Mock).mockReturnValue("/home");
  useAuthStore.setState({ status: "signedIn" });
  useSharedIntoContacts.setState({ pending: null });
  fs.__files.clear();
});

it("one contact card shared as a FILE opens a filled-in new contact", async () => {
  fs.__files.set("file:///tmp/Jamil.vcf", card("Jamil"));
  mockIntent.current = { files: [{ path: "/tmp/Jamil.vcf", mimeType: "text/x-vcard", fileName: "Jamil.vcf" }], text: null };
  render(<ShareIntentBridge />);
  await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/edit", params: { shared: "1" } }));
  const pending = useSharedIntoContacts.getState().pending;
  expect(pending?.kind === "card" && pending.card.firstname).toBe("Jamil");
  await waitFor(() => expect(mockReset).toHaveBeenCalled());
});

it("several cards go through the bulk import", async () => {
  fs.__files.set("file:///tmp/all.vcf", card("A") + card("B") + card("C"));
  mockIntent.current = { files: [{ path: "/tmp/all.vcf", mimeType: "text/vcard", fileName: "all.vcf" }], text: null };
  render(<ShareIntentBridge />);
  await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/import", params: { shared: "1" } }));
  const pending = useSharedIntoContacts.getState().pending;
  expect(pending?.kind === "cards" && pending.cards).toHaveLength(3);
});

it("a vCard shared as TEXT is a contact too", async () => {
  mockIntent.current = { files: null, text: card("Sara") };
  render(<ShareIntentBridge />);
  await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/edit", params: { shared: "1" } }));
});

it("a text with a number goes to 'add as a contact', never to Pages", async () => {
  mockIntent.current = { files: null, text: "Ali's new number: 07 01 23 45 67" };
  render(<ShareIntentBridge />);
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/contacts/shared"));
  expect(useSharedIntoContacts.getState().pending).toMatchObject({ kind: "bits", phones: ["07 01 23 45 67"] });
  expect(router.push).not.toHaveBeenCalledWith("/pages/save");
});

it("photos still go to Save to Pages", async () => {
  mockIntent.current = { files: [{ path: "/tmp/p.jpg", mimeType: "image/jpeg", fileName: "p.jpg" }], text: null };
  render(<ShareIntentBridge />);
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/pages/save"));
  expect(usePendingImport.getState().files?.[0]?.uri).toBe("file:///tmp/p.jpg");
});

it("a plain sentence is let go, and the cold-start landing goes home", async () => {
  (usePathname as jest.Mock).mockReturnValue("/share");
  mockIntent.current = { files: null, text: "see you later" };
  render(<ShareIntentBridge />);
  await waitFor(() => expect(mockReset).toHaveBeenCalled());
  expect(router.replace).toHaveBeenCalledWith("/");
  expect(router.push).not.toHaveBeenCalled();
});

it("from the cold-start landing, REPLACES it rather than stacking a screen", async () => {
  (usePathname as jest.Mock).mockReturnValue("/share");
  mockIntent.current = { files: null, text: "jamil@work.test" };
  render(<ShareIntentBridge />);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/contacts/shared"));
  expect(router.push).not.toHaveBeenCalled();
});

it("waits while signed out, then acts", async () => {
  useAuthStore.setState({ status: "signedOut" });
  mockIntent.current = { files: null, text: "0701234567" };
  const view = render(<ShareIntentBridge />);
  expect(router.push).not.toHaveBeenCalled();
  useAuthStore.setState({ status: "signedIn" });
  view.rerender(<ShareIntentBridge />);
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/contacts/shared"));
});
