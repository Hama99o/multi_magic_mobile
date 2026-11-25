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
import { Alert, Linking, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
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
import MyFamily from "../../../../app/contacts/my-family";
import { useSharedIntoContacts } from "@/stores/sharedIntoContacts.store";
import { parseCard } from "../shareIn";
import { __parse } from "@/api/contacts";

const __contact = __parse.parseContact;

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
  // Found on a device, 2026-11-25 (flow 130, contacts 500): under "Could not
  // load your contacts." the search field read "Search 0 contacts", a count
  // the app did not have. The number is only said once the book has loaded.
  it("a failed load never says how many contacts there are", async () => {
    mock.onGet(BASE).reply(500, { error: "boom" });
    renderScreen(<Contacts />);
    expect(await screen.findByTestId("contacts-load-failed")).toBeTruthy();
    const field = screen.queryByTestId("contacts-search");
    if (field) expect(field.props.placeholder).toBe("Search contacts");
    expect(screen.queryByPlaceholderText(/Search 0 contacts/)).toBeNull();
  });

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

  // Hidden criterion (Hello, 2026-11-21): a 200 % system font. Each row's
  // height is FIXED (getItemLayout, so a jump to Z never measures), but Android
  // scales fontSize AND lineHeight: the name (body, 22) and the subtitle
  // (caption, 17) need 78 dp at 200 % in a 64 dp row, and the header's label
  // (18) needs 36 in 32. The text spilled into the next row.
  it("at a 200 % system font each row holds its two lines and each header its label", async () => {
    const RN = require("react-native");
    const flat = (el: { props: Record<string, unknown> }) => (StyleSheet.flatten(el.props.style as StyleProp<ViewStyle>) ?? {}) as { height: number };
    jest.spyOn(RN, "useWindowDimensions").mockReturnValue({ width: 411, height: 900, scale: 2.6, fontScale: 2 });
    mock.onGet(BASE).reply(200, page([contact({ id: 1, firstname: "Zara", lastname: "" })]));
    renderScreen(<Contacts />);
    const row = await screen.findByTestId("contacts-row-1");
    expect(flat(row).height).toBeGreaterThanOrEqual((22 + 17) * 2);
    const header = screen.getByTestId("contacts-section-Z-frame");
    expect(flat(header).height).toBeGreaterThanOrEqual(18 * 2);
  });

  // The A–Z strip: 27 letters on 15 dp lines are ~400 dp at 100 % and ~810 at
  // 200 %, taller than a phone's list, so the last letters fell off the screen
  // and could not be reached. A scrub index does not grow with the system font
  // (iOS's own section index ignores Dynamic Type); the list it scrubs does.
  it("at a 200 % system font the A–Z index keeps every letter on screen (capped at 120 %)", async () => {
    const RN = require("react-native");
    jest.spyOn(RN, "useWindowDimensions").mockReturnValue({ width: 411, height: 900, scale: 2.6, fontScale: 2 });
    mock.onGet(BASE).reply(200, page("ABCDEFGHIJ".split("").map((l, i) => contact({ id: i + 1, firstname: `${l}ara`, lastname: "" }))));
    renderScreen(<Contacts />);
    const letter = await screen.findByTestId("contacts-index-A");
    expect(letter.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.2);
  });

  it("at 100 % the rows and headers keep their 64 and 32 dp", async () => {
    const RN = require("react-native");
    const flat = (el: { props: Record<string, unknown> }) => (StyleSheet.flatten(el.props.style as StyleProp<ViewStyle>) ?? {}) as { height: number };
    jest.spyOn(RN, "useWindowDimensions").mockReturnValue({ width: 411, height: 900, scale: 2.6, fontScale: 1 });
    mock.onGet(BASE).reply(200, page([contact({ id: 1, firstname: "Zara", lastname: "" })]));
    renderScreen(<Contacts />);
    expect(flat(await screen.findByTestId("contacts-row-1")).height).toBe(64);
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

  // Audit #25, web AddFamilyMemberModal: a gendered role, a kind of tie, then
  // someone from the book. A role says a gender the card did not know.
  it("links a family member: a role, a kind of tie, then a person from the book", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact() });
    mock.onGet(BASE).reply(200, page([contact(), contact({ id: 8, firstname: "Anisa", lastname: "Safi", gender: "unknown" })]));
    mock.onPost(`${BASE}/7/relations`).reply(201, { relations: [] });
    mock.onPut(`${BASE}/8`).reply(200, { contact: contact({ id: 8, gender: "female" }) });
    // Opened straight from a link (no list screen below it): the book is
    // read when "Add" is tapped, not borrowed from a cache that may be empty.
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-family-add"));
    fireEvent.press(screen.getByTestId("contact-family-role-sister"));
    fireEvent.press(await screen.findByTestId("contact-family-qualifier-half"));
    fireEvent.press(await screen.findByTestId("contact-family-who-8"));
    await waitFor(() => expect(mock.history.post.find((r) => r.url === `${BASE}/7/relations`)?.data).toBe(JSON.stringify({ relative_id: 8, kind: "sibling", qualifier: "half" })));
    await waitFor(() => expect(mock.history.put.find((r) => r.url === `${BASE}/8`)?.data).toBe(JSON.stringify({ contact: { gender: "female" } })));
  });

  it("the who-is-it list has a search, so a long book is not scrolled by hand (old audit P2)", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact() });
    mock.onGet(BASE).reply(200, page([contact(), contact({ id: 8, firstname: "Anisa", lastname: "Safi" }), contact({ id: 9, firstname: "Bilal", lastname: "Khan" })]));
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-family-add"));
    fireEvent.press(screen.getByTestId("contact-family-role-friend"));
    expect(await screen.findByTestId("contact-family-who-9")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("contact-family-who-search"), "anis");
    expect(screen.getByTestId("contact-family-who-8")).toBeTruthy();
    expect(screen.queryByTestId("contact-family-who-9")).toBeNull();
    // "New person" stays whatever is typed: the one you want may not be in the book.
    expect(screen.getByTestId("contact-family-who-new")).toBeTruthy();
  });

  it("a friend skips the kind of tie", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact() });
    mock.onGet(BASE).reply(200, page([contact(), contact({ id: 8, firstname: "Anisa", lastname: "Safi" })]));
    mock.onPost(`${BASE}/7/relations`).reply(201, { relations: [] });
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-family-add"));
    fireEvent.press(screen.getByTestId("contact-family-role-friend"));
    expect(screen.queryByTestId("contact-family-qualifier")).toBeNull();
    fireEvent.press(await screen.findByTestId("contact-family-who-8"));
    await waitFor(() => expect(mock.history.post[0]?.data).toBe(JSON.stringify({ relative_id: 8, kind: "friend", qualifier: "biological" })));
  });

  // Web "createNew": a grandfather not yet in the book is one call, not two.
  it("adds a new person as the father, created and linked in one call", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact() });
    mock.onGet(BASE).reply(200, page([contact()]));
    mock.onPost(`${BASE}/7/relations`).reply(201, { relations: [] });
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-family-add"));
    fireEvent.press(screen.getByTestId("contact-family-role-father"));
    fireEvent.press(await screen.findByTestId("contact-family-qualifier-biological"));
    fireEvent.press(await screen.findByTestId("contact-family-who-new"));
    fireEvent.changeText(await screen.findByTestId("pages-name-input"), "  Wali Ahmad Safi ");
    fireEvent.press(screen.getByTestId("pages-name-confirm"));
    await waitFor(() => expect(JSON.parse(mock.history.post[0]?.data ?? "{}")).toEqual({
      relative: { firstname: "Wali", lastname: "Ahmad Safi", gender: "male" }, kind: "parent", qualifier: "biological",
    }));
  });

  // Web "viaFamily": "my wife's brother" is a tie on the wife.
  it("adds an in-law through a current spouse: the tie is recorded on the spouse", async () => {
    const wife = { id: 20, kind: "spouse", qualifier: "biological", status: "current", label: "wife", relative: { id: 21, name: "Sara Noor", gender: "female" } };
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact({ relations: [wife] }) });
    mock.onGet(BASE).reply(200, page([contact(), contact({ id: 8, firstname: "Omar", lastname: "Noor", gender: "male" })]));
    mock.onPost(`${BASE}/21/relations`).reply(201, { relations: [] });
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-family-add"));
    fireEvent.press(screen.getByTestId("contact-family-role-21-brother"));
    fireEvent.press(await screen.findByTestId("contact-family-qualifier-biological"));
    fireEvent.press(await screen.findByTestId("contact-family-who-8"));
    await waitFor(() => expect(mock.history.post[0]?.url).toBe(`${BASE}/21/relations`));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ relative_id: 8, kind: "sibling", qualifier: "biological" });
  });

  // ContactCard.tsx:344 overwrote "father" with the neutral "parent".
  it("each tie reads as the web says it: gendered, qualified, (you), deceased; parents first", async () => {
    mock.onGet(`${BASE}/7`).reply(200, {
      contact: contact({
        relations: [
          { id: 3, kind: "sibling", qualifier: "half", status: "current", label: "half-sister", relative: { id: 8, name: "Anisa Safi", gender: "female", age: 30, is_self: true } },
          { id: 4, kind: "parent", qualifier: "biological", status: "current", label: "father", relative: { id: 9, name: "Wali Safi", gender: "male", deceased_on: "2020-02-02" } },
        ],
      }),
    });
    renderScreen(<ContactDetail />);
    const rows = await screen.findAllByTestId(/^contact-relation-\d+$/);
    expect(rows.map((r) => r.props.testID)).toEqual(["contact-relation-4", "contact-relation-3"]);
    expect(rows[0]).toHaveTextContent(/^father · deceased/);
    expect(rows[1]).toHaveTextContent(/half-sister/);
    expect(rows[1]).toHaveTextContent(/Anisa Safi \(you\)/);
  });

  // Web FamilySection changeRole: "I put my sister down as my father".
  it("changes what a relative is: the new kind and the relative's gender go together", async () => {
    const dad = { id: 4, kind: "parent", qualifier: "biological", status: "current", label: "father", relative: { id: 9, name: "Wali Safi", gender: "male" } };
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact({ relations: [dad] }) });
    mock.onPatch(`${BASE}/7/relations/4`).reply(200, { relations: [{ ...dad, kind: "sibling", label: "sister", relative: { ...dad.relative, gender: "female" } }] });
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-relation-4-edit"));
    fireEvent.press(await screen.findByTestId("contact-relation-menu-role"));
    fireEvent.press(await screen.findByTestId("contact-relation-role-sister"));
    await waitFor(() => expect(mock.history.patch[0]?.data).toBe(JSON.stringify({ kind: "sibling", relative_gender: "female" })));
  });

  it("changes a tie's kind to step", async () => {
    const dad = { id: 4, kind: "parent", qualifier: "biological", status: "current", label: "father", relative: { id: 9, name: "Wali Safi", gender: "male" } };
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact({ relations: [dad] }) });
    mock.onPatch(`${BASE}/7/relations/4`).reply(200, { relations: [{ ...dad, qualifier: "step" }] });
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-relation-4-edit"));
    fireEvent.press(await screen.findByTestId("contact-relation-menu-qualifier"));
    fireEvent.press(await screen.findByTestId("contact-relation-qualifier-step"));
    await waitFor(() => expect(mock.history.patch[0]?.data).toBe(JSON.stringify({ qualifier: "step" })));
  });

  it("'Family tree' opens the tree, and is offered only when there is a tie", async () => {
    const dad = { id: 4, kind: "parent", qualifier: "biological", status: "current", label: "father", relative: { id: 9, name: "Wali Safi", gender: "male" } };
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact({ relations: [dad] }) });
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-family-tree"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/family", params: { id: "7" } });
  });

  it("no 'Family tree' without a tie", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact() });
    renderScreen(<ContactDetail />);
    await screen.findByTestId("contact-family-none");
    expect(screen.queryByTestId("contact-family-tree")).toBeNull();
  });

  // Audit #24: shown as the web drawer shows them.
  it("shows closeness, every social link (tap opens it) and the tags", async () => {
    mock.onGet(`${BASE}/7`).reply(200, {
      contact: contact({ closeness: "close", tags: ["school", "chess club"], social_links: [{ label: "linkedin", value: "linkedin.test/in/jamil" }] }),
    });
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    renderScreen(<ContactDetail />);
    expect(await screen.findByTestId("contact-closeness")).toHaveTextContent("Close");
    expect(screen.getByTestId("contact-social-0")).toHaveTextContent(/LinkedIn.*linkedin\.test\/in\/jamil/);
    expect(screen.getByTestId("contact-tags")).toHaveTextContent(/school.*chess club/);
    fireEvent.press(screen.getByTestId("contact-social-0"));
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://linkedin.test/in/jamil"));
  });

  it("no closeness chip, links or tags when there are none", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact({ closeness: "unset", tags: [], social_links: [] }) });
    renderScreen(<ContactDetail />);
    await screen.findByTestId("contact-name");
    expect(screen.queryByTestId("contact-closeness")).toBeNull();
    expect(screen.queryByTestId("contact-social-0")).toBeNull();
    expect(screen.queryByTestId("contact-tags")).toBeNull();
  });

  // Web FamilyTab SelfPicker / WhoYouAre: asks before, undoes without asking.
  it("'This is me' asks first, then marks the contact as the user; 'This is not me' takes it back", async () => {
    let self = false;
    mock.onGet(`${BASE}/7`).reply(() => [200, { contact: contact({ is_self: self }) }]);
    mock.onPut(`${BASE}/7`).reply((config) => {
      self = JSON.parse(config.data).contact.is_self;
      return [200, { contact: contact({ is_self: self }) }];
    });
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-self-toggle"));
    expect((Alert.alert as jest.Mock).mock.calls.at(-1)?.[0]).toBe("Set Jamil Safi as you?");
    expect(mock.history.put).toHaveLength(0);
    act(() => alertButtons().find((b) => b.text === "Yes, that is me")?.onPress?.());
    expect(await screen.findByTestId("contact-self")).toHaveTextContent("This is you");
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ contact: { is_self: true } });
    fireEvent.press(screen.getByTestId("contact-self-toggle"));
    await waitFor(() => expect(mock.history.put).toHaveLength(2));
    expect(JSON.parse(mock.history.put[1].data)).toEqual({ contact: { is_self: false } });
    await waitFor(() => expect(screen.queryByTestId("contact-self")).toBeNull());
  });

  // TestFlight: the web stores notes as Tiptap HTML and the card showed the
  // tags as text. Invented fixture.
  it("notes stored as HTML are drawn as text, not as tags", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact({ notes: "<p>Door code is on the <strong>fridge</strong> &amp; spare key</p><p></p>" }) });
    renderScreen(<ContactDetail />);
    const box = await screen.findByTestId("contact-notes");
    expect(box).toHaveTextContent("Door code is on the fridge & spare key");
    expect(screen.queryAllByText(/<\/?[a-z][^>]*>/i)).toHaveLength(0);
    expect(screen.queryAllByText(/&amp;/)).toHaveLength(0);
    // The empty trailing paragraph is trimmed, not drawn as a blank line.
    type Node = { type: unknown; children: (Node | string)[] };
    const textOf = (n: Node): string => n.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");
    const blank = box.findAll((n) => (n.type as unknown) === "Text").filter((n) => !textOf(n as unknown as Node).trim());
    expect(blank.length).toBe(0);
  });

  it("a long press on HTML notes copies the words, not the markup", async () => {
    const clipboard = jest.requireMock("expo-clipboard") as { setStringAsync: jest.Mock };
    clipboard.setStringAsync.mockClear();
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact({ notes: "<p>Door code is on the fridge</p><p>Water the plants</p><p></p>" }) });
    renderScreen(<ContactDetail />);
    fireEvent(await screen.findByTestId("contact-notes-box"), "longPress");
    expect(clipboard.setStringAsync).toHaveBeenCalledWith("Door code is on the fridge\nWater the plants");
  });

  it("plain-text notes (no tags) still show exactly as typed", async () => {
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact({ notes: "Gate code 4411\nAsk for Bilal at 5 < 6" }) });
    renderScreen(<ContactDetail />);
    expect(await screen.findByTestId("contact-notes")).toHaveTextContent("Gate code 4411 Ask for Bilal at 5 < 6");
  });
});

// ── DOCUMENTS (audit #8; web ContactDrawer.tsx documents, server AttachmentActions) ──
describe("documents on a contact", () => {
  const imagePicker = jest.requireMock("expo-image-picker") as { launchImageLibraryAsync: jest.Mock; requestMediaLibraryPermissionsAsync: jest.Mock };
  const docPicker = DocumentPicker as unknown as { getDocumentAsync: jest.Mock };
  const doc = (id: number, filename: string, over: Record<string, unknown> = {}) => ({
    id, filename, byte_size: 2048 * id, content_type: "image/jpeg",
    url: `/rails/active_storage/blobs/proxy/d${id}/${filename}`, thumbnail_url: null, ...over,
  });
  const withDocs = (docs: unknown[]) => ({ contact: contact({ documents: docs }) });
  /** The card as the server holds it: a write answers with it AND changes it,
   *  so the refetch after the write reads the new state, as in production. */
  let held: unknown[] = [];
  const serve = (docs: unknown[]) => {
    held = docs;
    mock.onGet(`${BASE}/7`).reply(() => [200, withDocs(held)]);
  };
  const answer = (docs: unknown[]) => () => {
    held = docs;
    return [200, withDocs(docs)] as [number, unknown];
  };

  beforeEach(() => {
    mockParams.current = { id: "7" };
    imagePicker.launchImageLibraryAsync.mockReset();
    docPicker.getDocumentAsync.mockReset();
  });

  it("lists them newest first with name and size, and no longer sends him to the web", async () => {
    mock.onGet(`${BASE}/7`).reply(200, withDocs([doc(2, "old-id.jpg"), doc(5, "passport.pdf", { content_type: "application/pdf" })]));
    renderScreen(<ContactDetail />);
    const rows = await screen.findAllByTestId(/^contact-document-\d+$/);
    expect(rows.map((r) => r.props.testID)).toEqual(["contact-document-5", "contact-document-2"]);
    expect(rows[0]).toHaveTextContent(/passport\.pdf/);
    expect(rows[0]).toHaveTextContent(/10 KB/);
    expect(screen.queryByText(/on the web/)).toBeNull();
  });

  it("says when there are none, and still offers Add", async () => {
    serve([]);
    renderScreen(<ContactDetail />);
    expect(await screen.findByTestId("contact-documents-empty")).toHaveTextContent("No documents yet");
    expect(screen.getByTestId("contact-documents-add")).toBeTruthy();
  });

  it("while only the list row is known, waits; if the full card fails, says so and retries", async () => {
    const client = testQueryClient();
    // A list row: the base view has no `documents` key.
    const { documents: _none, ...row } = contact();
    client.setQueryData(["contacts", "list"], [__contact(row)]);
    let calls = 0;
    mock.onGet(`${BASE}/7`).reply(() => (++calls === 1 ? [500, {}] : [200, withDocs([doc(3, "visa.jpg")])]));
    render(<QueryClientProvider client={client}><ContactDetail /></QueryClientProvider>);
    expect(screen.getByTestId("contact-documents-loading")).toBeTruthy();
    // React Query drops a placeholder on an error: the card says so as a whole.
    expect(await screen.findByTestId("contact-load-failed")).toBeTruthy();
    fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByTestId("contact-document-3")).toBeTruthy();
  });

  it("tapping a document opens it in the viewer", async () => {
    mock.onGet(`${BASE}/7`).reply(200, withDocs([doc(4, "card.jpg")]));
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-document-4"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/document", params: { contactId: "7", documentId: "4" } });
  });

  it("adds from Files: sends them as documents[] and shows what the server kept", async () => {
    serve([]);
    docPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///cache/lease.pdf", name: "lease.pdf", mimeType: "application/pdf", size: 4000 }],
    });
    mock.onPost(`${BASE}/7/upload_documents`).reply(answer([doc(8, "lease.pdf", { content_type: "application/pdf" })]));
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-documents-add"));
    fireEvent.press(screen.getByTestId("contact-documents-source-files"));
    expect(await screen.findByTestId("contact-document-8")).toHaveTextContent(/lease\.pdf/);
    expect(mock.history.post.filter((r) => r.url === `${BASE}/7/upload_documents`)).toHaveLength(1);
  });

  it("adds from the photo library, images only", async () => {
    serve([]);
    imagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///cache/IMG_1.jpg", fileName: "IMG_1.jpg", mimeType: "image/jpeg", fileSize: 3000, type: "image" }],
    });
    mock.onPost(`${BASE}/7/upload_documents`).reply(answer([doc(9, "IMG_1.jpg")]));
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-documents-add"));
    fireEvent.press(screen.getByTestId("contact-documents-source-library"));
    expect(await screen.findByTestId("contact-document-9")).toBeTruthy();
    expect(imagePicker.launchImageLibraryAsync.mock.calls[0][0]).toMatchObject({ mediaTypes: ["images"], allowsMultipleSelection: true });
  });

  it("refuses before sending what the server would refuse, naming the file and why", async () => {
    serve([]);
    docPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file:///cache/cv.docx", name: "cv.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 10 },
        { uri: "file:///cache/scan.pdf", name: "scan.pdf", mimeType: "application/pdf", size: 25 * 1024 * 1024 },
      ],
    });
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-documents-add"));
    fireEvent.press(screen.getByTestId("contact-documents-source-files"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Some files can’t be added", expect.any(String)));
    const body = (Alert.alert as jest.Mock).mock.calls.at(-1)[1] as string;
    expect(body).toMatch(/cv\.docx: only images \(PNG, JPEG, GIF, WebP\) and PDF/);
    expect(body).toMatch(/scan\.pdf: bigger than 20 MB/);
    expect(mock.history.post.filter((r) => r.url === `${BASE}/7/upload_documents`)).toHaveLength(0);
  });

  it("shows the server's own refusal", async () => {
    serve([]);
    docPicker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: "file:///cache/a.pdf", name: "a.pdf", mimeType: "application/pdf", size: 10 }] });
    mock.onPost(`${BASE}/7/upload_documents`).reply(422, { errors: ["Documents has an invalid content type"] });
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-documents-add"));
    fireEvent.press(screen.getByTestId("contact-documents-source-files"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Could not add the document", "Documents has an invalid content type"));
  });

  it("renames from the row's menu, starting from the current name", async () => {
    serve([doc(5, "scan.pdf", { content_type: "application/pdf" })]);
    mock.onPatch(`${BASE}/7/documents/5`).reply(answer([doc(5, "passport.pdf", { content_type: "application/pdf" })]));
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-document-5-more"));
    fireEvent.press(screen.getByTestId("contact-document-menu-rename"));
    expect((await screen.findByTestId("pages-name-input")).props.value).toBe("scan.pdf");
    fireEvent.changeText(screen.getByTestId("pages-name-input"), "passport.pdf");
    fireEvent.press(screen.getByTestId("pages-name-confirm"));
    expect(await screen.findByText("passport.pdf")).toBeTruthy();
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ filename: "passport.pdf" });
  });

  it("deletes after a confirmation that names the file", async () => {
    serve([doc(5, "scan.pdf")]);
    mock.onDelete(`${BASE}/7/documents/5`).reply(answer([]));
    renderScreen(<ContactDetail />);
    fireEvent.press(await screen.findByTestId("contact-document-5-more"));
    fireEvent.press(screen.getByTestId("contact-document-menu-delete"));
    expect((Alert.alert as jest.Mock).mock.calls.at(-1)[0]).toBe("Delete scan.pdf?");
    expect(mock.history.delete).toHaveLength(0);
    act(() => alertButtons().find((b) => b.text === "Delete")?.onPress?.());
    expect(await screen.findByTestId("contact-documents-empty")).toBeTruthy();
    expect(mock.history.delete[0].url).toBe(`${BASE}/7/documents/5`);
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

  // Audit #24: the web drawer's gender, closeness, social links and tags.
  it("sets gender, closeness, a social link and tags, and sends exactly those params", async () => {
    mockParams.current = { id: "7" };
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact({ tags: ["school"] }) });
    mock.onPut(`${BASE}/7`).reply(200, { contact: contact() });
    renderScreen(<EditContact />);
    fireEvent.press(await screen.findByTestId("contact-form-gender"));
    fireEvent.press(screen.getByTestId("contact-form-gender-sheet-female"));
    fireEvent.press(screen.getByTestId("contact-form-closeness"));
    fireEvent.press(screen.getByTestId("contact-form-closeness-sheet-distant"));
    fireEvent.press(screen.getByTestId("contact-form-add-socialLinks"));
    fireEvent.press(screen.getByTestId("contact-form-socialLinks-0-label"));
    fireEvent.press(screen.getByTestId("contact-form-label-sheet-github"));
    fireEvent.changeText(screen.getByTestId("contact-form-socialLinks-0"), "https://github.test/jamil");
    fireEvent.changeText(screen.getByTestId("contact-form-tag-input"), " chess ");
    fireEvent(screen.getByTestId("contact-form-tag-input"), "submitEditing");
    fireEvent.press(screen.getByTestId("contact-form-tag-school-remove"));
    fireEvent.press(screen.getByTestId("contact-form-save"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const body = JSON.parse(mock.history.put[0].data).contact;
    expect(body).toMatchObject({
      gender: "female", closeness: "distant", tags: ["chess"],
      social_links: [{ label: "github", value: "https://github.test/jamil" }],
    });
    expect(Object.keys(body).sort()).toEqual([
      "addresses", "birth_date", "closeness", "company", "emails", "favorite", "firstname", "gender", "job_title",
      "lastname", "nickname", "notes", "phones", "social_links", "tags", "website",
    ]);
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

  // Owner, 2026-11-15: "no edit-on-web, everything editable on mobile". The
  // web stores contact notes as Tiptap HTML; the form shows them as rich text
  // and edits them in the Notes engine (app/rich-text.tsx), never as tags in
  // a text box, and never saves a stripped version.
  it("HTML notes read as rich text in the form and open the rich editor", async () => {
    mockParams.current = { id: "7" };
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact({ notes: "<p>Door code is on the <strong>fridge</strong></p>" }) });
    renderScreen(<EditContact />);
    const notes = await screen.findByTestId("contact-form-notes");
    expect(notes).toHaveTextContent(/Door code is on the fridge/);
    expect(screen.queryByText(/<p>|<strong>/)).toBeNull();
    fireEvent.press(notes);
    expect(router.push).toHaveBeenCalledWith("/rich-text");
    const { useRichTextSession } = jest.requireActual("@/stores/richTextSession.store");
    expect(useRichTextSession.getState().session.html).toBe("<p>Door code is on the <strong>fridge</strong></p>");
  });

  it("what the rich editor hands back is saved as the web's HTML", async () => {
    mockParams.current = { id: "7" };
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact({ notes: "<p>Door code is on the fridge</p>" }) });
    mock.onPut(`${BASE}/7`).reply(200, { contact: contact() });
    renderScreen(<EditContact />);
    fireEvent.press(await screen.findByTestId("contact-form-notes"));
    const { useRichTextSession } = jest.requireActual("@/stores/richTextSession.store");
    act(() => useRichTextSession.getState().session.onDone("<p><strong>Water the plants</strong></p>"));
    expect(await screen.findByTestId("contact-form-notes")).toHaveTextContent(/Water the plants/);
    fireEvent.press(screen.getByTestId("contact-form-save"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(JSON.parse(mock.history.put[0].data).contact.notes).toBe("<p><strong>Water the plants</strong></p>");
  });

  it("notes left alone go back exactly as they came (never stripped)", async () => {
    mockParams.current = { id: "7" };
    const html = "<p>Door code is on the <strong>fridge</strong> &amp; spare key</p><p></p>";
    mock.onGet(`${BASE}/7`).reply(200, { contact: contact({ notes: html }) });
    mock.onPut(`${BASE}/7`).reply(200, { contact: contact() });
    renderScreen(<EditContact />);
    await screen.findByTestId("contact-form-notes");
    fireEvent.changeText(screen.getByTestId("contact-form-firstname"), "Jamil B.");
    fireEvent.press(screen.getByTestId("contact-form-save"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(JSON.parse(mock.history.put[0].data).contact.notes).toBe(html);
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

// The web's "My Family" tab (`FamilyTab.tsx`, `GET contacts/family_members`),
// parity 2026-11-20: only the user's family, measured from the contact marked
// as them; without one it asks who they are first, and twice.
describe("My family", () => {
  const fam = (self: number | null, rows: unknown[]) => ({ self_id: self, contacts: rows });

  it("is in the Contacts menu", async () => {
    mock.onGet(BASE).reply(200, page([contact()]));
    renderScreen(<Contacts />);
    fireEvent.press(await screen.findByTestId("contacts-more"));
    fireEvent.press(screen.getByTestId("contacts-menu-family"));
    expect(router.push).toHaveBeenCalledWith("/contacts/my-family");
  });

  it("lists the family with each one's tie to the user, opens a person, the tree and the user's own card", async () => {
    mock.onGet(`${BASE}/family_members`).reply(
      200,
      fam(1, [
        { ...contact({ id: 1, firstname: "[qa] Self", lastname: null, is_self: true }), family_label: null },
        { ...contact({ id: 2, firstname: "[qa] Mum", lastname: null }), family_label: "mother" },
      ]),
    );
    renderScreen(<MyFamily />);
    expect(await screen.findByText("[qa] Mum")).toBeTruthy();
    expect(screen.getByTestId("my-family-count")).toHaveTextContent("2 family members");
    expect(screen.getByTestId("my-family-you-are")).toHaveTextContent("You are [qa] Self");
    expect(screen.getByTestId("my-family-badge-1")).toHaveTextContent("you");
    expect(screen.getByTestId("my-family-badge-2")).toHaveTextContent("mother");
    fireEvent.press(screen.getByTestId("my-family-row-2"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/contact", params: { id: "2" } });
    fireEvent.press(screen.getByTestId("my-family-tree"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/family", params: { id: "1" } });
    fireEvent.press(screen.getByTestId("my-family-add"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/contact", params: { id: "1" } });
  });

  it("Not me clears who the user is", async () => {
    mock.onGet(`${BASE}/family_members`).reply(200, fam(1, [{ ...contact({ id: 1, firstname: "[qa] Self", lastname: null, is_self: true }), family_label: null }]));
    mock.onPut(`${BASE}/1`).reply(200, { contact: contact({ id: 1, is_self: false }) });
    renderScreen(<MyFamily />);
    fireEvent.press(await screen.findByTestId("my-family-change-self"));
    await waitFor(() => expect(mock.history.put.map((r) => JSON.parse(r.data as string))).toEqual([{ contact: { is_self: false } }]));
  });

  it("with no one marked as the user, asks who they are, finds them by name, and asks again before saving", async () => {
    mock.onGet(`${BASE}/family_members`).reply(200, fam(null, []));
    mock.onGet(BASE).reply(200, page([contact({ id: 4, firstname: "[qa] Alex", lastname: null }), contact({ id: 5, firstname: "[qa] Sam", lastname: null })]));
    mock.onPut(`${BASE}/5`).reply(200, { contact: contact({ id: 5, is_self: true }) });
    renderScreen(<MyFamily />);
    expect(await screen.findByText("Who are you?")).toBeTruthy();
    expect(screen.getByText("No family yet. Mark which contact is you, then link your relatives.")).toBeTruthy();
    expect(screen.queryByTestId("my-family-add")).toBeNull();
    fireEvent.changeText(screen.getByTestId("my-family-self-search"), "sam");
    expect(screen.queryByTestId("my-family-self-4")).toBeNull();
    fireEvent.press(await screen.findByTestId("my-family-self-5"));
    expect(screen.getByText("Is [qa] Sam you?")).toBeTruthy();
    expect(mock.history.put).toHaveLength(0);
    fireEvent.press(screen.getByTestId("my-family-self-yes"));
    await waitFor(() => expect(mock.history.put.map((r) => [r.url, JSON.parse(r.data as string)])).toEqual([[`${BASE}/5`, { contact: { is_self: true } }]]));
  });
});
