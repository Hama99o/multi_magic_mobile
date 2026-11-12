/**
 * The Contacts app, screen by screen, at the HTTP layer: the real API
 * functions and parsers run, every request is asserted by its body, and
 * every action that leaves the app is asserted by the URL it opens.
 *
 * What this cannot see: a pixel, the dialer or WhatsApp actually opening,
 * the share sheet, the system contact picker — the device sweep's
 * (`docs/QA_REPORT_<date>.md`, the checklist there).
 */
import MockAdapter from "axios-mock-adapter";
import { Alert, Linking } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useContactsUndo } from "@/stores/contactsUndo.store";
import { useContactsCountry } from "@/stores/contactsCountry.store";
import { router as mockedRouter } from "expo-router";
import Contacts from "../../../../app/contacts";
import ContactDetail from "../../../../app/contacts/contact";
import EditContact from "../../../../app/contacts/edit";
import ImportContacts from "../../../../app/contacts/import";
import SharedIntoContacts from "../../../../app/contacts/shared";
import { useSharedIntoContacts } from "@/stores/sharedIntoContacts.store";
import { parseCard } from "../shareIn";

const mockParams: { current: Record<string, string> } = { current: {} };
const mockBeforeRemove: { handler: ((e: { preventDefault: () => void; data: { action: unknown } }) => void) | null } = { handler: null };
const mockNavigation = {
  addListener: jest.fn((name: string, handler: typeof mockBeforeRemove.handler) => {
    if (name === "beforeRemove") mockBeforeRemove.handler = handler;
    return () => {
      mockBeforeRemove.handler = null;
    };
  }),
  dispatch: jest.fn(),
};
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
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
jest.mock("expo-file-system", () => {
  const files = new Map<string, string>();
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
    }
    get exists() {
      return files.has(this.uri);
    }
    create() {
      files.set(this.uri, "");
    }
    write(text: string) {
      files.set(this.uri, text);
    }
    delete() {
      files.delete(this.uri);
    }
    async text() {
      return files.get(this.uri) ?? "";
    }
  }
  return { File, Paths: { cache: { uri: "file:///cache" } }, __files: files };
});

const router = mockedRouter as unknown as { push: jest.Mock; back: jest.Mock; replace: jest.Mock };
const phone = jest.requireMock("expo-contacts") as {
  Contact: Record<"presentPicker" | "getAllDetails" | "presentCreateForm", jest.Mock>;
  requestPermissionsAsync: jest.Mock;
};
const fs = jest.requireMock("expo-file-system") as { __files: Map<string, string> };
const BASE = "/api/v1/contact_app/contacts";
let mock: MockAdapter;

function contact(over: Record<string, unknown> = {}) {
  return {
    id: 7, firstname: "Jamil", lastname: "Safi", nickname: null, company: "Acme", job_title: "Driver", favorite: false,
    birth_date: null, age: null, photo_url: null, email: "jamil@home.test", phone: "0701234567", is_self: false,
    phones: [{ label: "mobile", value: "0701234567" }, { label: "work", value: "+33 6 12 34 56 78" }],
    emails: [{ label: "home", value: "jamil@home.test" }, { label: "work", value: "jamil@work.test" }],
    addresses: [], relations: [], documents: [], website: null, notes: null,
    ...over,
  };
}
const page = (contacts: unknown[], n = 1, pages = 1) => ({ contacts, meta: { pagy: { page: n, pages }, total_count: contacts.length } });

function renderScreen(element: ReactElement) {
  return render(<QueryClientProvider client={testQueryClient()}>{element}</QueryClientProvider>);
}

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
  mockParams.current = {};
  router.push.mockClear();
  router.back.mockClear();
  router.replace.mockClear();
  mockNavigation.dispatch.mockClear();
  useContactsUndo.setState({ trashed: null });
  useContactsCountry.setState({ country: "AF", hydrated: true });
  (Sharing.shareAsync as jest.Mock).mockClear();
  fs.__files.clear();
  mock.onGet(/\/ai\/conversation$/).reply(200, { conversation: { id: 1 } });
  mock.onGet(/\/ai\/sessions/).reply(200, { sessions: [] });
  mock.onGet(`${BASE}/upcoming_birthdays`).reply(200, { birthdays: [] });
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

type Button = { text: string; onPress?: () => void };
const alertButtons = () => ((Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] ?? []) as Button[];

// ── THE LIST ───────────────────────────────────────────────────────────────
describe("the list", () => {
  it("reads every page and lays it out A–Z, favourites first", async () => {
    mock.onGet(BASE).reply((config) =>
      config.params.page === 1
        ? [200, page([contact({ id: 1, firstname: "Zara", lastname: "" }), contact({ id: 2, firstname: "ali", lastname: "", favorite: true })], 1, 2)]
        : [200, page([contact({ id: 3, firstname: "Bilal", lastname: "" })], 2, 2)],
    );
    renderScreen(<Contacts />);

    expect(await screen.findByTestId("contacts-section-★")).toBeTruthy();
    for (const key of ["A", "B", "Z"]) expect(screen.getByTestId(`contacts-section-${key}`)).toBeTruthy();
    expect(screen.getByTestId("contacts-row-3")).toBeTruthy();
  });

  it("an empty book says so and offers the two ways in", async () => {
    mock.onGet(BASE).reply(200, page([]));
    renderScreen(<Contacts />);
    fireEvent.press(await screen.findByTestId("contacts-empty-import"));
    expect(router.push).toHaveBeenCalledWith("/contacts/import");
    fireEvent.press(screen.getByTestId("contacts-empty-new"));
    expect(router.push).toHaveBeenCalledWith("/contacts/edit");
  });

  it("search finds a contact by their SECOND email through the server, and filters by name meanwhile", async () => {
    mock.onGet(BASE).reply((config) =>
      config.params.search === "jamil@work.test"
        ? [200, page([contact({ id: 7 })])]
        : [200, page([contact({ id: 7 }), contact({ id: 8, firstname: "Sara", lastname: "", emails: [], phones: [] })])],
    );
    renderScreen(<Contacts />);
    await screen.findByTestId("contacts-row-8");

    fireEvent.changeText(screen.getByTestId("contacts-search"), "sara");
    expect(screen.getByTestId("contacts-row-8")).toBeTruthy();
    expect(screen.queryByTestId("contacts-row-7")).toBeNull();

    fireEvent.changeText(screen.getByTestId("contacts-search"), "jamil@work.test");
    await waitFor(() => expect(mock.history.get.some((r) => r.params?.search === "jamil@work.test")).toBe(true), { timeout: 3000 });
    expect(await screen.findByTestId("contacts-row-7")).toBeTruthy();
    expect(screen.queryByTestId("contacts-row-8")).toBeNull();
  });

  it("a long press offers WhatsApp, which asks which number and opens 07… as +93 (the default country)", async () => {
    mock.onGet(BASE).reply(200, page([contact()]));
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    renderScreen(<Contacts />);
    fireEvent(await screen.findByTestId("contacts-row-7"), "longPress");
    fireEvent.press(screen.getByTestId("contacts-row-actions-whatsapp"));
    fireEvent.press(await screen.findByTestId("contact-number-sheet-0"));
    expect(open).toHaveBeenCalledWith("whatsapp://send?phone=93701234567");
  });

  it("select mode exports the chosen contacts as ONE .vcf through the share sheet, then deletes the file", async () => {
    mock.onGet(BASE).reply(200, page([contact({ id: 1, firstname: "A" }), contact({ id: 2, firstname: "B" }), contact({ id: 3, firstname: "C" })]));
    mock.onGet(`${BASE}/export_multiple_contacts`).reply(200, "BEGIN:VCARD\r\nFN:A\r\nEND:VCARD\r\nBEGIN:VCARD\r\nFN:C\r\nEND:VCARD\r\n");
    renderScreen(<Contacts />);
    fireEvent.press(await screen.findByTestId("contacts-more"));
    fireEvent.press(screen.getByTestId("contacts-menu-select"));
    fireEvent.press(screen.getByTestId("contacts-row-1"));
    fireEvent.press(screen.getByTestId("contacts-row-3"));
    fireEvent.press(screen.getByTestId("contacts-export-selected"));

    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    const request = mock.history.get.find((r) => r.url?.endsWith("/export_multiple_contacts"));
    expect(request?.params).toEqual({ ids: [1, 3] });
    expect((Sharing.shareAsync as jest.Mock).mock.calls[0][0]).toMatch(/\.vcf$/);
    expect((Sharing.shareAsync as jest.Mock).mock.calls[0][1]).toMatchObject({ mimeType: "text/vcard" });
    expect(fs.__files.size).toBe(0);
  });

  it("Export all asks the server for the whole book (all=true)", async () => {
    mock.onGet(BASE).reply(200, page([contact()]));
    mock.onGet(`${BASE}/export_multiple_contacts`).reply(200, "BEGIN:VCARD\r\nEND:VCARD\r\n");
    renderScreen(<Contacts />);
    fireEvent.press(await screen.findByTestId("contacts-more"));
    fireEvent.press(screen.getByTestId("contacts-menu-export-all"));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    expect(mock.history.get.find((r) => r.url?.endsWith("/export_multiple_contacts"))?.params).toEqual({ all: true });
  });

  it("Undo after a delete restores the contact", async () => {
    mock.onGet(BASE).reply(200, page([contact()]));
    mock.onPut(`${BASE}/7/restore`).reply(200, {});
    useContactsUndo.setState({ trashed: { id: 7, name: "Jamil Safi", at: Date.now() } });
    renderScreen(<Contacts />);
    fireEvent.press(await screen.findByTestId("contacts-undo-button"));
    await waitFor(() => expect(mock.history.put.some((r) => r.url === `${BASE}/7/restore`)).toBe(true));
    await waitFor(() => expect(useContactsUndo.getState().trashed).toBeNull());
  });
});

// ── ONE CONTACT ────────────────────────────────────────────────────────────
describe("one contact", () => {
  beforeEach(() => {
    mockParams.current = { id: "7" };
  });

  it("shows EVERY phone and email (the owner's second-email bug, end to end)", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact() });
    renderScreen(<ContactDetail />);
    expect(await screen.findByTestId("contact-email-1")).toHaveTextContent(/jamil@work\.test/);
    expect(screen.getByTestId("contact-email-0")).toHaveTextContent(/jamil@home\.test/);
    expect(screen.getByTestId("contact-phone-1")).toHaveTextContent(/\+33 6 12 34 56 78/);
  });

  it("Call with two numbers asks which, then dials the one picked as written", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact() });
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-quick-call"));
    fireEvent.press(await screen.findByTestId("contact-number-sheet-1"));
    expect(open).toHaveBeenCalledWith("tel:+33612345678");
  });

  it("a number's own WhatsApp button opens that number, international", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact() });
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-phone-1-whatsapp"));
    expect(open).toHaveBeenCalledWith("whatsapp://send?phone=33612345678");
  });

  it("without WhatsApp installed, says so and opens wa.me in the browser on request", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact() });
    const open = jest.spyOn(Linking, "openURL").mockRejectedValueOnce(new Error("no app")).mockResolvedValue(true);
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-phone-0-whatsapp"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("WhatsApp isn’t on this phone", expect.any(String), expect.any(Array)));
    alertButtons().find((b) => b.text === "Open in the browser")?.onPress?.();
    expect(open).toHaveBeenLastCalledWith("https://wa.me/93701234567");
  });

  it("a national number with no country anywhere asks for one, remembers it, then opens", async () => {
    useContactsCountry.setState({ country: null, hydrated: true });
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact({ phones: [{ label: "mobile", value: "06 12 34 56 78" }] }) });
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-quick-whatsapp"));
    fireEvent.press(await screen.findByTestId("contact-country-sheet-FR"));
    expect(open).toHaveBeenCalledWith("whatsapp://send?phone=33612345678");
    expect(useContactsCountry.getState().country).toBe("FR");
  });

  it("the contact's own address country wins over the default", async () => {
    mock.onGet(`${BASE}/7`).reply(200, {
      contact: contact({
        phones: [{ label: "mobile", value: "06 12 34 56 78" }],
        addresses: [{ label: "home", street: "", city: "Lyon", state: "", postal: "", country: "France" }],
      }),
    });
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-quick-whatsapp"));
    expect(open).toHaveBeenCalledWith("whatsapp://send?phone=33612345678");
  });

  it("Email is shown but disabled when there is no email, and a tablet that cannot call says so", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact({ emails: [], phones: [{ label: "mobile", value: "0700 000 000" }] }) });
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("No Activity found"));
    renderScreen(<ContactDetail />);
    expect((await screen.findByTestId("contact-quick-email")).props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId("contact-quick-call"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("This device can’t make calls", expect.stringContaining("0700 000 000"), expect.any(Array)));
  });

  it("Share writes the server's vCard to a file and opens the share sheet", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact() });
    mock.onGet(`${BASE}/7/export_vcard`).reply(200, "BEGIN:VCARD\r\nFN:Jamil Safi\r\nEND:VCARD\r\n");
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-share"));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.stringMatching(/Jamil Safi\.vcf$/), expect.objectContaining({ mimeType: "text/vcard" })));
  });

  it("Save to phone opens the system form with every number and email", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact() });
    phone.requestPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: "all" });
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-save-to-phone"));
    await waitFor(() => expect(phone.Contact.presentCreateForm).toHaveBeenCalled());
    expect(phone.Contact.presentCreateForm.mock.calls[0][0].emails).toHaveLength(2);
  });

  it("Delete asks with the name, trashes, offers Undo on the list and goes back", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact() });
    mock.onDelete(`${BASE}/7`).reply(200, {});
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-delete"));
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe("Delete Jamil Safi?");
    act(() => alertButtons().find((b) => b.text === "Delete")?.onPress?.());
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(useContactsUndo.getState().trashed).toMatchObject({ id: 7, name: "Jamil Safi" });
  });

  it("links a family member: a role, then a person from the book", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact() });
    mock.onGet(BASE).reply(200, page([contact(), contact({ id: 8, firstname: "Anisa", lastname: "Safi" })]));
    mock.onPost(`${BASE}/7/relations`).reply(201, { relations: [] });
    // Opened straight from a link (no list screen below it): the book is
    // read when "Add" is tapped, not borrowed from a cache that may be empty.
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-family-add"));
    fireEvent.press(screen.getByTestId("contact-family-kind-sibling"));
    fireEvent.press(await screen.findByTestId("contact-family-who-8"));
    await waitFor(() => expect(mock.history.post.find((r) => r.url === `${BASE}/7/relations`)?.data).toBe(JSON.stringify({ relative_id: 8, kind: "sibling" })));
  });
});

// ── THE FORM ───────────────────────────────────────────────────────────────
describe("the form", () => {
  it("creates a contact with TWO phones and opens it", async () => {
    mock.onPost(BASE).reply(201, { contact: contact({ id: 9 }) });
    renderScreen(<EditContact />);
    fireEvent.changeText(screen.getByTestId("contact-form-firstname"), "Sara");
    fireEvent.changeText(screen.getByTestId("contact-form-phones-0"), "06 12 34 56 78");
    fireEvent.press(screen.getByTestId("contact-form-add-phones"));
    fireEvent.changeText(screen.getByTestId("contact-form-phones-1"), "+93 70 123 4567");
    fireEvent.press(screen.getByTestId("contact-form-save"));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: "/contacts/contact", params: { id: "9" } }));
    const body = JSON.parse(mock.history.post.find((r) => r.url === BASE)?.data ?? "{}");
    expect(body.contact.phones).toEqual([{ label: "mobile", value: "06 12 34 56 78" }, { label: "home", value: "+93 70 123 4567" }]);
    expect(body.contact.emails).toEqual([]);
  });

  it("two fast taps on Save make ONE contact", async () => {
    mock.onPost(BASE).reply(() => new Promise((resolve) => setTimeout(() => resolve([201, { contact: contact({ id: 9 }) }]), 50)));
    renderScreen(<EditContact />);
    fireEvent.changeText(screen.getByTestId("contact-form-firstname"), "Sara");
    act(() => {
      fireEvent.press(screen.getByTestId("contact-form-save"));
      fireEvent.press(screen.getByTestId("contact-form-save"));
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(mock.history.post.filter((r) => r.url === BASE)).toHaveLength(1);
  });

  it("refuses a bad email and a missing name, sending nothing", async () => {
    renderScreen(<EditContact />);
    fireEvent.changeText(screen.getByTestId("contact-form-emails-0"), "nope");
    fireEvent.press(screen.getByTestId("contact-form-save"));
    expect(screen.getByTestId("contact-form-name-error")).toBeTruthy();
    expect(screen.getByTestId("contact-form-emails-0-error")).toBeTruthy();
    expect(mock.history.post).toHaveLength(0);
  });

  it("editing removes one email and sends the remaining list whole", async () => {
    mockParams.current = { id: "7" };
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact() });
    mock.onPut(`${BASE}/7`).reply(200, { contact: contact() });
    renderScreen(<EditContact />);
    fireEvent.press(await screen.findByTestId("contact-form-emails-0-remove"));
    fireEvent.press(screen.getByTestId("contact-form-save"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const body = JSON.parse(mock.history.put[0].data);
    expect(body.contact.emails).toEqual([{ label: "work", value: "jamil@work.test" }]);
    expect(body.contact.phones).toHaveLength(2);
  });

  it("a save that fails keeps the draft and says why under the header", async () => {
    mock.onPost(BASE).networkError();
    renderScreen(<EditContact />);
    fireEvent.changeText(screen.getByTestId("contact-form-firstname"), "Sara");
    fireEvent.press(screen.getByTestId("contact-form-save"));
    expect(await screen.findByTestId("contact-form-error")).toHaveTextContent(/^Not saved\./);
    expect(screen.getByTestId("contact-form-firstname").props.value).toBe("Sara");
  });

  it("leaving with changes asks first", async () => {
    renderScreen(<EditContact />);
    fireEvent.changeText(screen.getByTestId("contact-form-firstname"), "Sara");
    const prevent = jest.fn();
    act(() => mockBeforeRemove.handler?.({ preventDefault: prevent, data: { action: { type: "GO_BACK" } } }));
    expect(prevent).toHaveBeenCalled();
    expect((Alert.alert as jest.Mock).mock.calls.at(-1)?.[0]).toBe("Discard your changes?");
  });
});

// ── IMPORT ─────────────────────────────────────────────────────────────────
describe("import", () => {
  const vcf = (n: number) => Array.from({ length: n }, (_, i) => `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:P${i}\r\nEND:VCARD\r\n`).join("");
  const reply = (vcfText: string) => {
    const n = (vcfText.match(/BEGIN:VCARD/g) ?? []).length;
    return { summary: { created: n - 1, skipped: 1, failed: 0, total: n }, skipped: [{ name: "Twin", existing_id: 3 }], failed: [] };
  };

  it("a .vcf of 120 cards goes in three requests and ends on the summary", async () => {
    fs.__files.set("file:///picked.vcf", vcf(120));
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///picked.vcf", name: "all.vcf" }] });
    mock.onPost(`${BASE}/import_vcard`).reply((config) => [201, reply(JSON.parse(config.data).vcf)]);
    renderScreen(<ImportContacts />);
    fireEvent.press(screen.getByTestId("contacts-import-file"));

    expect(await screen.findByTestId("contacts-import-summary")).toHaveTextContent("117 contacts added");
    expect(mock.history.post).toHaveLength(3);
    expect(screen.getByTestId("contacts-import-added")).toHaveTextContent(/117/);
    expect(screen.getByTestId("contacts-import-skipped")).toHaveTextContent(/3/);
    fireEvent.press(screen.getByTestId("contacts-import-names"));
    expect(screen.getByTestId("contacts-import-name-list")).toHaveTextContent(/Twin/);
  });

  it("a file that is not a vCard says so and sends nothing", async () => {
    fs.__files.set("file:///x.txt", "hello");
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///x.txt", name: "x.txt" }] });
    renderScreen(<ImportContacts />);
    fireEvent.press(screen.getByTestId("contacts-import-file"));
    expect(await screen.findByTestId("contacts-import-note")).toHaveTextContent("This file holds no contact card (.vcf).");
    expect(mock.history.post).toHaveLength(0);
  });

  it("from the phone: denied says so and offers Settings", async () => {
    phone.requestPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    const settings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    renderScreen(<ImportContacts />);
    fireEvent.press(screen.getByTestId("contacts-import-phone"));
    expect(await screen.findByTestId("contacts-import-note")).toHaveTextContent(/isn’t allowed/);
    fireEvent.press(screen.getByTestId("contacts-import-settings"));
    expect(settings).toHaveBeenCalled();
  });

  it("from the phone: every contact chosen at first, untick one, import the rest as vCards", async () => {
    phone.requestPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: "all" });
    phone.Contact.getAllDetails.mockResolvedValue([
      { id: "a", givenName: "Ali", phones: [{ label: "mobile", number: "0700" }] },
      { id: "b", givenName: "Bea", emails: [{ label: "home", address: "b@x.test" }] },
      { id: "c", givenName: "Cy", phones: [{ number: "0711" }] },
    ]);
    mock.onPost(`${BASE}/import_vcard`).reply((config) => [201, reply(JSON.parse(config.data).vcf)]);
    renderScreen(<ImportContacts />);
    fireEvent.press(screen.getByTestId("contacts-import-phone"));
    fireEvent.press(await screen.findByTestId("contacts-import-row-b"));
    expect(screen.getByTestId("contacts-import-go")).toHaveTextContent("Import 2 contacts");
    fireEvent.press(screen.getByTestId("contacts-import-go"));

    await screen.findByTestId("contacts-import-summary");
    const sent: string = JSON.parse(mock.history.post[0].data).vcf;
    expect(sent).toContain("N:;Ali;;;");
    expect(sent).toContain("N:;Cy;;;");
    expect(sent).not.toContain("Bea");
  });

  it("iOS 18 limited access says how many were shared and offers to share more", async () => {
    phone.requestPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: "limited" });
    phone.Contact.getAllDetails.mockResolvedValue([{ id: "a", givenName: "Ali" }]);
    renderScreen(<ImportContacts />);
    fireEvent.press(screen.getByTestId("contacts-import-phone"));
    expect(await screen.findByTestId("contacts-import-limited")).toHaveTextContent("You shared 1 contact with MultiMagic.");
    expect(screen.getByTestId("contacts-import-share-more")).toBeTruthy();
  });

  it("a one-card server is named, not hidden behind a wrong count", async () => {
    fs.__files.set("file:///p.vcf", vcf(5));
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///p.vcf", name: "p.vcf" }] });
    mock.onPost(`${BASE}/import_vcard`).reply(201, { contact: contact() });
    renderScreen(<ImportContacts />);
    fireEvent.press(screen.getByTestId("contacts-import-file"));
    expect(await screen.findByTestId("contacts-import-summary")).toHaveTextContent(/needs an update/);
  });

  it("a connection lost mid-way stops, says how far it got, and resumes from there", async () => {
    fs.__files.set("file:///p.vcf", vcf(120));
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///p.vcf", name: "p.vcf" }] });
    let n = 0;
    mock.onPost(`${BASE}/import_vcard`).reply((config) => {
      n += 1;
      return n === 2 ? [500, {}] : [201, reply(JSON.parse(config.data).vcf)];
    });
    renderScreen(<ImportContacts />);
    fireEvent.press(screen.getByTestId("contacts-import-file"));
    expect(await screen.findByTestId("contacts-import-summary")).toHaveTextContent("Stopped after 50 of 120");
    fireEvent.press(screen.getByTestId("contacts-import-resume"));
    expect(await screen.findByText("117 contacts added")).toBeTruthy();
    expect(mock.history.post).toHaveLength(4);
  });
});

// ── SHARED INTO MULTIMAGIC ─────────────────────────────────────────────────
describe("shared from another app", () => {
  const sharedCard = parseCard(
    "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Safi;Jamil;;;\r\nORG:Acme\r\nTEL;TYPE=CELL:0701234567\r\nTEL;TYPE=WORK:020 555 1234\r\n" +
      "EMAIL:new@x.test\r\nPHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRg==\r\nEND:VCARD\r\n",
  );

  it("a shared card opens the form filled in, and its photo is uploaded after the save", async () => {
    mockParams.current = { shared: "1" };
    useSharedIntoContacts.setState({ pending: { kind: "card", card: sharedCard } });
    mock.onGet(BASE).reply(200, page([]));
    mock.onPost(BASE).reply(201, { contact: contact({ id: 9 }) });
    mock.onPost(`${BASE}/9/upload_photo`).reply(200, { contact: contact({ id: 9 }) });
    renderScreen(<EditContact />);

    expect(screen.getByTestId("contact-form-firstname").props.value).toBe("Jamil");
    expect(screen.getByTestId("contact-form-phones-1").props.value).toBe("020 555 1234");
    expect(screen.getByTestId("contact-form-company").props.value).toBe("Acme");
    fireEvent.press(screen.getByTestId("contact-form-save"));
    await waitFor(() => expect(mock.history.post.some((r) => r.url === `${BASE}/9/upload_photo`)).toBe(true));
    expect(useSharedIntoContacts.getState().pending).toBeNull();
  });

  it("warns when the number is already someone's, and merges the new details into them", async () => {
    mockParams.current = { shared: "1" };
    useSharedIntoContacts.setState({ pending: { kind: "card", card: sharedCard } });
    mock.onGet(BASE).reply(200, page([contact({ id: 3, firstname: "Jamil", phones: [{ label: "mobile", value: "+93 70 123 4567" }], emails: [] })]));
    mock.onPut(`${BASE}/3`).reply(200, { contact: contact({ id: 3 }) });
    renderScreen(<EditContact />);

    expect(await screen.findByTestId("contact-form-duplicate")).toHaveTextContent(/Jamil Safi already has this number or email\./);
    fireEvent.press(screen.getByTestId("contact-form-merge"));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: "/contacts/contact", params: { id: "3" } }));
    const body = JSON.parse(mock.history.put[0].data);
    expect(body.contact.phones).toEqual([{ label: "mobile", value: "+93 70 123 4567" }, { label: "work", value: "020 555 1234" }]);
    expect(body.contact.emails).toEqual([{ label: "home", value: "new@x.test" }]);
    expect(mock.history.post.filter((r) => r.url === BASE)).toHaveLength(0);
  });

  it("a number from a text: shown, then added to an existing contact", async () => {
    useSharedIntoContacts.setState({ pending: { kind: "bits", text: "Ali: 06 12 34 56 78", phones: ["06 12 34 56 78"], emails: [] } });
    mock.onGet(BASE).reply(200, page([contact({ id: 5, firstname: "Ali", lastname: "", phones: [], emails: [] })]));
    mock.onPut(`${BASE}/5`).reply(200, { contact: contact({ id: 5 }) });
    renderScreen(<SharedIntoContacts />);
    expect(screen.getByTestId("contacts-shared-phone-06 12 34 56 78")).toBeTruthy();
    fireEvent.press(screen.getByTestId("contacts-shared-existing"));
    fireEvent.press(await screen.findByTestId("contacts-shared-pick-5"));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: "/contacts/contact", params: { id: "5" } }));
    expect(JSON.parse(mock.history.put[0].data).contact.phones).toEqual([{ label: "mobile", value: "06 12 34 56 78" }]);
  });

  it("a number from a text: 'Add as a new contact' opens the form with it", async () => {
    useSharedIntoContacts.setState({ pending: { kind: "bits", text: "x", phones: [], emails: ["a@x.test"] } });
    mock.onGet(BASE).reply(200, page([]));
    renderScreen(<SharedIntoContacts />);
    fireEvent.press(screen.getByTestId("contacts-shared-new"));
    expect(router.replace).toHaveBeenCalledWith({ pathname: "/contacts/edit", params: { shared: "1" } });
    const pending = useSharedIntoContacts.getState().pending;
    expect(pending?.kind === "card" && pending.card.emails).toEqual([{ label: "home", value: "a@x.test" }]);
  });

  it("several shared cards start the bulk import at once", async () => {
    mockParams.current = { shared: "1" };
    const cards = ["BEGIN:VCARD\r\nFN:A\r\nEND:VCARD\r\n", "BEGIN:VCARD\r\nFN:B\r\nEND:VCARD\r\n"];
    useSharedIntoContacts.setState({ pending: { kind: "cards", cards } });
    mock.onPost(`${BASE}/import_vcard`).reply(201, { summary: { created: 2, skipped: 0, failed: 0, total: 2 }, skipped: [], failed: [] });
    renderScreen(<ImportContacts />);
    expect(await screen.findByTestId("contacts-import-summary")).toHaveTextContent("2 contacts added");
  });
});
