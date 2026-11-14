/**
 * The Contacts tablet split (`docs/design/contacts/SPEC.md` §C.11,
 * `docs/MISSING_FEATURES.md` row 3): at 800 dp and wider, the list on the
 * left and the card on the right; under it, the phone's list → card push.
 *
 * The width comes from `useSplit()` (mocked here), so a rotation is a
 * re-render at a new width. What this cannot see: a pixel, the font size
 * the owner reported as small at 800 dp. That is the device pass.
 */
import MockAdapter from "axios-mock-adapter";
import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useContactsUndo } from "@/stores/contactsUndo.store";
import { useContactsCountry } from "@/stores/contactsCountry.store";
import { router as mockedRouter } from "expo-router";
import { isSplit, listPaneWidth, SPLIT_AT } from "../split";
import Contacts from "../../../../app/contacts";

const mockWidth = { current: 411 };
jest.mock("../split", () => {
  const actual = jest.requireActual("../split");
  return { ...actual, useSplit: () => actual.splitFor(mockWidth.current) };
});
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ addListener: jest.fn(() => () => undefined), dispatch: jest.fn() }),
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

const router = mockedRouter as unknown as { push: jest.Mock; back: jest.Mock };
const BASE = "/api/v1/contact_app/contacts";
let mock: MockAdapter;

function contact(id: number, firstname: string, lastname: string) {
  return {
    id, firstname, lastname, nickname: null, company: null, job_title: null, favorite: false, birth_date: null, age: null,
    photo_url: null, email: `${firstname.toLowerCase()}@example.test`, phone: null, is_self: false,
    phones: [], emails: [{ label: "home", value: `${firstname.toLowerCase()}@example.test` }],
    addresses: [], relations: [], documents: [], website: null, notes: null,
  };
}
const ali = contact(7, "Ali", "Demo");
const zoe = contact(8, "Zoe", "Sample");

function renderAt(width: number) {
  mockWidth.current = width;
  const client = testQueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <Contacts />
    </QueryClientProvider>,
  );
  /** Rotate: the same screen, re-rendered at a new width. */
  const rotate = (next: number) => {
    mockWidth.current = next;
    view.rerender(
      <QueryClientProvider client={client}>
        <Contacts />
      </QueryClientProvider>,
    );
  };
  return { ...view, rotate };
}

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
  router.push.mockClear();
  router.back.mockClear();
  useContactsUndo.setState({ trashed: null });
  useContactsCountry.setState({ country: "AF", hydrated: true });
  mock.onGet(/\/ai\/conversation$/).reply(200, { conversation: { id: 1 } });
  mock.onGet(/\/ai\/sessions/).reply(200, { sessions: [] });
  mock.onGet(`${BASE}/upcoming_birthdays`).reply(200, { birthdays: [] });
  mock.onGet(BASE).reply(200, { contacts: [ali, zoe], meta: { pagy: { page: 1, pages: 1 }, total_count: 2 } });
  mock.onGet(`${BASE}/7`).reply(200, { contact: ali });
  mock.onGet(`${BASE}/8`).reply(200, { contact: zoe });
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

describe("where the split starts", () => {
  it("at 800 dp and up, and the list pane keeps a phone's width", () => {
    expect(SPLIT_AT).toBe(800);
    expect(isSplit(360)).toBe(false);
    expect(isSplit(411)).toBe(false);
    expect(isSplit(799)).toBe(false);
    expect(isSplit(800)).toBe(true);
    expect(isSplit(1280)).toBe(true);
    // Never narrower than a 360 dp phone, never wider than 420 dp.
    expect(listPaneWidth(800)).toBe(360);
    expect(listPaneWidth(1280)).toBe(420);
  });
});

describe.each([360, 411])("a phone at %i dp: list, then the card's own screen", (width) => {
  it("a tap opens the card's route; there is no right pane", async () => {
    renderAt(width);
    fireEvent.press(await screen.findByTestId("contacts-row-7"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/contact", params: { id: "7" } });
    expect(screen.queryByTestId("contacts-split-pane")).toBeNull();
    expect(screen.queryByTestId("contacts-split-empty")).toBeNull();
  });
});

describe.each([800, 1280])("a tablet at %i dp: master-detail", (width) => {
  it("before a choice, the right pane says to select a contact", async () => {
    renderAt(width);
    await screen.findByTestId("contacts-row-7");
    expect(screen.getByTestId("contacts-split-empty")).toBeTruthy();
    expect(screen.getByText("Select a contact")).toBeTruthy();
  });

  it("a tap shows the card on the right, highlighted on the left, with no route push", async () => {
    renderAt(width);
    fireEvent.press(await screen.findByTestId("contacts-row-7"));
    expect(router.push).not.toHaveBeenCalled();
    expect(await screen.findByTestId("contact-name")).toBeTruthy();
    expect(screen.getByTestId("contact-name").props.children).toBe("Ali Demo");
    expect(screen.queryByTestId("contacts-split-empty")).toBeNull();
    expect(screen.getByTestId("contacts-row-7").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId("contacts-row-8").props.accessibilityState?.selected).toBeFalsy();
  });

  it("the card in the pane has no back button", async () => {
    renderAt(width);
    fireEvent.press(await screen.findByTestId("contacts-row-7"));
    await screen.findByTestId("contact-name");
    expect(screen.queryByTestId("contact-back")).toBeNull();
  });

  it("another tap moves the selection", async () => {
    renderAt(width);
    fireEvent.press(await screen.findByTestId("contacts-row-7"));
    await screen.findByTestId("contact-name");
    fireEvent.press(screen.getByTestId("contacts-row-8"));
    await waitFor(() => expect(screen.getByTestId("contact-name").props.children).toBe("Zoe Sample"));
    expect(screen.getByTestId("contacts-row-8").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId("contacts-row-7").props.accessibilityState?.selected).toBeFalsy();
  });

  it("deleting the shown contact empties the pane instead of going back", async () => {
    mock.onDelete(`${BASE}/7`).reply(204);
    (Alert.alert as jest.Mock).mockImplementation((_t, _b, buttons?: { style?: string; onPress?: () => void }[]) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    renderAt(width);
    fireEvent.press(await screen.findByTestId("contacts-row-7"));
    await screen.findByTestId("contact-name");
    fireEvent.press(screen.getByTestId("contact-delete"));
    await screen.findByTestId("contacts-split-empty");
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe("rotation keeps the selection", () => {
  it("1280 → 800 → 1280: the same contact, still highlighted", async () => {
    const view = renderAt(1280);
    fireEvent.press(await screen.findByTestId("contacts-row-8"));
    await screen.findByTestId("contact-name");
    act(() => view.rotate(800));
    expect(screen.getByTestId("contact-name").props.children).toBe("Zoe Sample");
    expect(screen.getByTestId("contacts-row-8").props.accessibilityState).toMatchObject({ selected: true });
    act(() => view.rotate(1280));
    expect(screen.getByTestId("contact-name").props.children).toBe("Zoe Sample");
  });

  it("through a phone width and back: the list alone at 411, the same card again at 1280", async () => {
    const view = renderAt(1280);
    fireEvent.press(await screen.findByTestId("contacts-row-8"));
    await screen.findByTestId("contact-name");
    act(() => view.rotate(411));
    expect(screen.queryByTestId("contacts-split-pane")).toBeNull();
    expect(await screen.findByTestId("contacts-row-8")).toBeTruthy();
    act(() => view.rotate(1280));
    await waitFor(() => expect(screen.getByTestId("contact-name").props.children).toBe("Zoe Sample"));
  });
});

it("French: the empty pane speaks French", async () => {
  await i18n.changeLanguage("fr");
  renderAt(800);
  await screen.findByTestId("contacts-row-7");
  expect(screen.getByText("Sélectionnez un contact")).toBeTruthy();
});
