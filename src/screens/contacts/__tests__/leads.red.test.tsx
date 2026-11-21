/**
 * Leads from ee's review of Contacts, each one made red before it was fixed:
 * sign-out leaving an Undo and a pending share for the next account, a family
 * tie unlinked in one tap with the relative's card and the tree left stale,
 * trash/restore leaving the family and duplicates screens stale, and a failed
 * document upload reported only while the card is still open. Invented data.
 */
import MockAdapter from "axios-mock-adapter";
import { Alert } from "react-native";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import * as DocumentPicker from "expo-document-picker";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { contactsKeys } from "@/api/keys";
import type { Contact } from "@/api/contacts";
import { endSession } from "@/lib/sessionEnd";
import { testQueryClient } from "@/__tests__/queryClient";
import { useContactsUndo } from "@/stores/contactsUndo.store";
import { useContactsCountry } from "@/stores/contactsCountry.store";
import { useSharedIntoContacts } from "@/stores/sharedIntoContacts.store";
import ContactDetail from "../../../../app/contacts/contact";
import { useRestoreContact, useTrashContact, useUnlinkRelative } from "../useContactMutations";

const mockParams: { current: Record<string, string> } = { current: {} };
const mockNavigation = { addListener: jest.fn(() => () => undefined), dispatch: jest.fn() };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
  useNavigation: () => mockNavigation,
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock("@/lib/cable", () => require("@/__tests__/screenMocks").cable);
jest.mock("expo-clipboard", () => require("@/__tests__/screenMocks").clipboard);
jest.mock("expo-image-picker", () => require("@/__tests__/screenMocks").imagePicker);
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn(async () => undefined) }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-contacts", () => ({
  Contact: { presentPicker: jest.fn(), getAllDetails: jest.fn(), presentCreateForm: jest.fn(async () => true), presentAccessPicker: jest.fn() },
  requestPermissionsAsync: jest.fn(),
}));

const BASE = "/api/v1/contact_app/contacts";
const docPicker = DocumentPicker as unknown as { getDocumentAsync: jest.Mock };
let mock: MockAdapter;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const renderScreen = (el: ReactElement) => render(<QueryClientProvider client={client}>{el}</QueryClientProvider>);

function gated(status: number, body: unknown = {}) {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  return { open, reply: async () => (await opened, [status, body] as [number, unknown]) };
}
function wire(over: Record<string, unknown> = {}) {
  return {
    id: 7, firstname: "Jamil", lastname: "Safi", nickname: null, company: null, job_title: null, favorite: false,
    birth_date: null, age: null, photo_url: null, email: null, phone: null, is_self: false,
    phones: [], emails: [], addresses: [], relations: [], documents: [], website: null, notes: null,
    ...over,
  };
}
const asContact = (id: number) => ({ id, firstname: `C${id}`, lastname: "Test", relations: [] }) as unknown as Contact;
type Button = { text: string; style?: string; onPress?: () => void };
const alertButtons = () => ((Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] ?? []) as Button[];
const invalidated = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
  mockParams.current = { id: "7" };
  useContactsUndo.setState({ trashed: null });
  useSharedIntoContacts.setState({ pending: null });
  useContactsCountry.setState({ country: "AF", hydrated: true });
  docPicker.getDocumentAsync.mockReset();
  client = testQueryClient({ queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity } });
  mock.onGet(/\/ai\/conversation$/).reply(200, { conversation: { id: 1 } });
  mock.onGet(/\/ai\/sessions/).reply(200, { sessions: [] });
  mock.onGet(`${BASE}/upcoming_birthdays`).reply(200, { birthdays: [] });
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});
afterEach(() => {
  mock.restore();
  client.clear();
  jest.restoreAllMocks();
});

describe("lead 1: sign-out leaves nothing of Contacts for the next account", () => {
  it("the Undo of a trashed contact is gone after the session ends", () => {
    useContactsUndo.getState().set({ id: 7, name: "Jamil Safi", at: Date.now() });
    endSession();
    expect(useContactsUndo.getState().trashed).toBeNull();
  });

  it("a share waiting for Contacts is gone after the session ends", () => {
    useSharedIntoContacts.getState().set({ kind: "bits", text: "Ali: 06 12 34 56 78", phones: ["06 12 34 56 78"], emails: [] });
    endSession();
    expect(useSharedIntoContacts.getState().pending).toBeNull();
  });
});

describe("lead 4: unlinking a family tie", () => {
  const dad = { id: 4, kind: "parent", qualifier: "biological", status: "current", label: "father", relative: { id: 9, name: "Wali Safi", gender: "male" } };

  it("asks first, naming the relative, and sends nothing until confirmed", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: wire({ relations: [dad] }) });
    mock.onDelete(`${BASE}/7/relations/4`).reply(204);
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-relation-4-remove"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mock.history.delete).toHaveLength(0);
    expect((Alert.alert as jest.Mock).mock.calls.at(-1)?.[0]).toBe("Unlink Wali Safi?");
    act(() => alertButtons().find((b) => b.style === "destructive")?.onPress?.());
    await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toEqual([`${BASE}/7/relations/4`]));
  });

  it("refetches the relative's card and the family trees", async () => {
    client.setQueryData(contactsKeys.detail(7), { ...asContact(7), relations: [{ id: 4, relative: { id: 9, name: "Wali Safi" } }] });
    mock.onDelete(`${BASE}/7/relations/4`).reply(204);
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUnlinkRelative(7), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(4);
    });
    expect(invalidated(spy)).toEqual(expect.arrayContaining([JSON.stringify(contactsKeys.detail(9)), JSON.stringify(contactsKeys.families())]));
  });
});

describe("lead 6: trash and restore refresh every screen a contact sits on", () => {
  const wanted = [contactsKeys.familyMembers(), contactsKeys.families(), contactsKeys.duplicates()].map((k) => JSON.stringify(k));

  it("to the trash: My family, the trees and the duplicates are refetched", async () => {
    mock.onDelete(`${BASE}/7`).reply(204);
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useTrashContact(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(asContact(7));
    });
    expect(invalidated(spy)).toEqual(expect.arrayContaining(wanted));
  });

  it("restored: the same", async () => {
    mock.onPut(`${BASE}/7/restore`).reply(200);
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRestoreContact(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(7);
    });
    expect(invalidated(spy)).toEqual(expect.arrayContaining(wanted));
  });
});

describe("lead 6: a failed upload is reported even after the card was left", () => {
  it("the upload fails after the card unmounted: the person is still told", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: wire() });
    docPicker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "file:///cache/a.pdf", name: "a.pdf", mimeType: "application/pdf", size: 10 }] });
    const g = gated(500);
    mock.onPost(`${BASE}/7/upload_documents`).reply(g.reply);
    const view = renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-documents-add"));
    fireEvent.press(screen.getByTestId("contact-documents-source-files"));
    await waitFor(() => expect(mock.history.post.filter((r) => r.url === `${BASE}/7/upload_documents`)).toHaveLength(1));
    view.unmount();
    g.open();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Could not add the document", expect.any(String)));
  });
});
