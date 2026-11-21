/**
 * THE APP SHELL: one header on every app, the switcher, the Profile apps list.
 * docs/design/app-shell/MANIFEST.md, M2–M7 and M10, plus the hidden criteria
 * (offline badges, double tap, RTL, accessibility names).
 */
import MockAdapter from "axios-mock-adapter";
import { I18nManager, StyleSheet } from "react-native";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { AppHeader, TITLE_MIN_SCALE, TITLE_SIZE, titleRoom } from "../AppHeader";
import { textWidth } from "./glyphWidths";
import { APP_REGISTRY, capBadge, type AppKey } from "@/apps/registry";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void) => jest.requireActual("react").useEffect(cb, [cb]),
}));

const { router } = jest.requireMock("expo-router") as {
  router: Record<"push" | "back" | "replace" | "dismissTo" | "canGoBack", jest.Mock>;
};
let mock: MockAdapter;

function counts(chats: number, notifications: number) {
  mock.onGet("/api/v1/conversations/unread_messages_count").reply(200, { unread_messages_count: chats, unread_messages_total: chats * 2 });
  mock.onGet("/api/v1/notifications/unread_count").reply(200, { unread_count: notifications });
}

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
  Object.values(router).forEach((fn) => fn.mockClear());
  router.canGoBack.mockReturnValue(true);
  mock.onGet(/users\/connected_user/).reply(200, { user: { id: 7, first_name: "Alex", last_name: "Martin", email: "alex@example.com" } });
  await AsyncStorage.clear();
});
afterEach(() => mock.restore());

function open(app: AppKey, extra: Partial<Parameters<typeof AppHeader>[0]> = {}) {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <AppHeader app={app} {...extra} />
    </QueryClientProvider>,
  );
}

const ORDER = ["header-chats", "header-notifications", "header-ai", "header-apps", "header-profile"];

describe("the registry (M5)", () => {
  it("lists every mobile app once, in the web's order, Home first", () => {
    expect(APP_REGISTRY.map((a) => a.key)).toEqual([
      "home", "safezone", "notes", "todos", "pages", "finance", "chats", "doc",
      "contacts", "calendar", "assistant", "notifications", "conversations",
    ]);
  });

  it("names each app in both languages", async () => {
    for (const lang of ["en", "fr"]) {
      await i18n.changeLanguage(lang);
      for (const a of APP_REGISTRY) {
        expect(i18n.exists(a.labelKey)).toBe(true);
        expect(i18n.exists(a.lineKey)).toBe(true);
      }
    }
  });

  it("caps a badge the way the web does: chats at 9+, notifications at 99+", () => {
    expect(capBadge(0, 9)).toBeNull();
    expect(capBadge(undefined, 9)).toBeNull();
    expect(capBadge(3, 9)).toBe("3");
    expect(capBadge(10, 9)).toBe("9+");
    expect(capBadge(99, 99)).toBe("99");
    expect(capBadge(100, 99)).toBe("99+");
  });
});

describe("the header (M1, M2, M3, M10)", () => {
  it("holds Chats, Notifications, AI, Apps and the avatar, in the web's order, and names the app", async () => {
    counts(0, 0);
    open("todos");
    const header = await screen.findByTestId("app-header");
    const ids: string[] = [];
    const walk = (node: { props?: { testID?: string }; children?: unknown[] } | string) => {
      if (typeof node === "string") return;
      if (node.props?.testID && ORDER.includes(node.props.testID) && !ids.includes(node.props.testID)) ids.push(node.props.testID);
      (node.children ?? []).forEach((c) => walk(c as never));
    };
    walk(header as never);
    expect(ids).toEqual(ORDER);
    expect(within(header).getByText("Tasks")).toBeTruthy();
    expect(screen.getByTestId("header-title").props.accessibilityRole).toBe("header");
  });

  it("shows the unread counts from the server, capped, and reads them aloud", async () => {
    counts(12, 140);
    open("finance");
    expect(await screen.findByText("9+")).toBeTruthy();
    expect(await screen.findByText("99+")).toBeTruthy();
    expect(screen.getByTestId("header-chats").props.accessibilityLabel).toBe("Chats, 12 waiting");
    expect(screen.getByTestId("header-notifications").props.accessibilityLabel).toBe("Notifications, 140 unread");
  });

  it("shows no badge at zero, and none while the count cannot be read (offline is not 0)", async () => {
    mock.onGet("/api/v1/conversations/unread_messages_count").networkError();
    mock.onGet("/api/v1/notifications/unread_count").reply(500);
    open("notes");
    await screen.findByTestId("app-header");
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByTestId("header-chats-badge")).toBeNull();
    expect(screen.queryByTestId("header-notifications-badge")).toBeNull();
    expect(screen.getByTestId("header-chats").props.accessibilityLabel).toBe("Chats");
  });

  it.each([
    ["header-chats", "/chats"],
    ["header-notifications", "/notifications"],
  ])("%s opens its screen", async (id, route) => {
    counts(0, 0);
    open("finance");
    fireEvent.press(await screen.findByTestId(id));
    expect(router.push).toHaveBeenCalledWith(route);
  });

  it("the AI button opens the assistant over the current screen, and says so", async () => {
    counts(0, 0);
    open("finance");
    const ai = await screen.findByTestId("header-ai");
    expect(ai.props.accessibilityLabel).toBe("Ask the assistant");
    fireEvent.press(ai);
    expect(router.push).toHaveBeenCalledWith("/chat");
    expect(router.replace).not.toHaveBeenCalled();
  });

  describe("room at small widths: shrink, never drop a web control", () => {
    const widthOf = (w: number) => jest.spyOn(require("react-native"), "useWindowDimensions").mockReturnValue({ width: w, height: 800, scale: 2, fontScale: 1 });
    afterEach(() => jest.restoreAllMocks());

    it("at 360 dp the five buttons shrink to 36 and the title stays, one line", async () => {
      widthOf(360);
      counts(0, 0);
      open("todos", { title: "Groceries", back: true });
      const title = await screen.findByTestId("header-title");
      expect(title.props.numberOfLines).toBe(1);
      for (const id of ORDER.slice(0, 4)) expect(StyleSheet.flatten(screen.getByTestId(id).props.style).width).toBe(36);
    });

    it("at 411 dp they are 40", async () => {
      widthOf(411);
      counts(0, 0);
      open("todos");
      await screen.findByTestId("header-title");
      expect(StyleSheet.flatten(screen.getByTestId("header-ai").props.style).width).toBe(40);
    });

    it("below 340 dp only the badge shows, and the name is still read aloud", async () => {
      widthOf(320);
      counts(0, 0);
      open("finance");
      await screen.findByTestId("app-header");
      expect(screen.queryByTestId("header-title")).toBeNull();
      expect(screen.getByTestId("header-home").props.accessibilityLabel).toBe("Finance, Go to Home");
      for (const id of ORDER) expect(screen.getByTestId(id)).toBeTruthy();
    });

    // mm-40 saw "Discussio…" at FR 360 dp: an app's name is never cut on a phone.
    it.each(["en", "fr"])("in %s every app's name fits its header at 340 and 360 dp, scaled down at most to the floor", (lng) => {
      const tr = i18n.getFixedT(lng);
      const names = APP_REGISTRY.filter((a) => !a.modal).map((a) => (a.key === "home" ? tr("home.title") : tr(a.labelKey)));
      expect(names).toContain(lng === "fr" ? "Discussions" : "Chats");
      for (const w of [340, 360]) {
        for (const n of names) {
          expect({ n, w, fits: textWidth(n, TITLE_SIZE * TITLE_MIN_SCALE) <= titleRoom(w) }).toEqual({ n, w, fits: true });
        }
      }
      // At 360 the French Chats name fits at full size, without shrinking.
      if (lng === "fr") expect(textWidth("Discussions", TITLE_SIZE)).toBeLessThanOrEqual(titleRoom(360));
    });

    it("the title shrinks to fit before it would ever ellipsize", async () => {
      widthOf(360);
      counts(0, 0);
      open("chats");
      const title = await screen.findByTestId("header-title");
      expect(title.props.adjustsFontSizeToFit).toBe(true);
      expect(title.props.minimumFontScale).toBe(TITLE_MIN_SCALE);
      expect(StyleSheet.flatten(title.props.style).fontSize).toBe(TITLE_SIZE);
    });

    it("the room a phone gives the title is what the header lays out (360: 36 dp buttons with no gap)", async () => {
      widthOf(360);
      counts(0, 0);
      open("finance");
      await screen.findByTestId("header-title");
      expect(StyleSheet.flatten(screen.getByTestId("header-buttons").props.style).gap).toBe(0);
      expect(titleRoom(360)).toBe(360 - 2 * 16 - 32 - 2 * 6 - 5 * 36);
    });

    it("on a tablet the buttons carry their names", async () => {
      widthOf(800);
      counts(0, 0);
      open("finance");
      await screen.findByTestId("app-header");
      expect(screen.getByTestId("header-ai-label")).toHaveTextContent("AI");
      expect(screen.getByTestId("header-chats-label")).toHaveTextContent("Chats");
    });

    // The owner: "the top must be identical everywhere". On 2026-11-20 a
    // header that sized itself from a 640 dp column dropped its button names
    // there and kept them on full-width screens: two looks on one tablet.
    // The header follows the WINDOW; a screen gives it the full width through
    // `Screen`'s `header` slot (src/components/ScreenContainer.tsx).
    it("at 800 dp the buttons carry the same names wherever the header is laid out", async () => {
      widthOf(800);
      counts(0, 0);
      open("finance");
      const header = await screen.findByTestId("app-header");
      act(() => fireEvent(header, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 640 - 2 * 16, height: 56 } } }));
      expect(screen.getByTestId("header-chats-label")).toHaveTextContent("Chats");
      expect(screen.getByTestId("header-ai-label")).toHaveTextContent("AI");
    });
  });

  it.each([
    ["header-chats", "/chats"],
    ["header-notifications", "/notifications"],
    ["header-ai", "/chat"],
  ])("a double tap on %s opens its screen once (black-box run)", async (id, route) => {
    counts(0, 0);
    open("finance");
    const button = await screen.findByTestId(id);
    fireEvent.press(button);
    fireEvent.press(button);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(route);
  });

  it("a second tap after the guard window works again", async () => {
    counts(0, 0);
    jest.useFakeTimers();
    try {
      open("finance");
      const ai = screen.getByTestId("header-ai");
      fireEvent.press(ai);
      act(() => jest.advanceTimersByTime(1200));
      fireEvent.press(ai);
      expect(router.push).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("on the Chats screen its own button is shown selected and does nothing", async () => {
    counts(2, 0);
    open("chats");
    const own = await screen.findByTestId("header-chats");
    expect(own.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    fireEvent.press(own);
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("back and Home (M7)", () => {
  it("an app root has no back arrow; its badge goes Home", async () => {
    counts(0, 0);
    open("todos");
    expect(screen.queryByTestId("header-back")).toBeNull();
    fireEvent.press(await screen.findByTestId("header-home"));
    expect(router.dismissTo).toHaveBeenCalledWith("/home");
  });

  it("opened with nothing behind (a link), the badge replaces with Home", async () => {
    counts(0, 0);
    router.canGoBack.mockReturnValue(false);
    open("todos");
    fireEvent.press(await screen.findByTestId("header-home"));
    expect(router.replace).toHaveBeenCalledWith("/home");
  });

  it("a sub-screen has a back chevron that goes back", async () => {
    counts(0, 0);
    open("todos", { title: "Groceries", back: true });
    expect(screen.queryByTestId("header-home")).toBeNull();
    fireEvent.press(await screen.findByTestId("header-back"));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Groceries")).toBeTruthy();
  });

  it("a sub-screen with nothing behind goes to its app's root", async () => {
    counts(0, 0);
    router.canGoBack.mockReturnValue(false);
    open("finance", { title: "Loan", back: true });
    fireEvent.press(await screen.findByTestId("header-back"));
    expect(router.replace).toHaveBeenCalledWith("/finance");
  });

  it("a sub-screen may hand its own back (unsaved changes)", async () => {
    counts(0, 0);
    const onBack = jest.fn();
    open("finance", { title: "Loan", back: true, onBack });
    fireEvent.press(await screen.findByTestId("header-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
  });

  it("the chevron mirrors in a right-to-left language", async () => {
    counts(0, 0);
    const was = I18nManager.isRTL;
    Object.defineProperty(I18nManager, "isRTL", { value: true, configurable: true });
    try {
      open("todos", { title: "Groceries", back: true });
      const icon = await screen.findByTestId("header-back-icon");
      expect(StyleSheet.flatten(icon.props.style)).toEqual(expect.objectContaining({ transform: [{ scaleX: -1 }] }));
    } finally {
      Object.defineProperty(I18nManager, "isRTL", { value: was, configurable: true });
    }
  });
});

describe("the switcher (M4, M10)", () => {
  it("lists every app, rings the current one, and shows the badges", async () => {
    counts(3, 12);
    open("finance");
    fireEvent.press(await screen.findByTestId("header-apps"));
    const sheet = await screen.findByTestId("app-switcher");
    for (const a of APP_REGISTRY) expect(within(sheet).getByTestId(`switcher-app-${a.key}`)).toBeTruthy();
    expect(within(sheet).getByTestId("switcher-app-finance").props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(within(sheet).getByTestId("switcher-app-notes").props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
    expect(await within(sheet).findByTestId("switcher-app-chats-badge")).toBeTruthy();
  });

  it("from an app root, a tap replaces this app with the other one (back never cycles)", async () => {
    counts(0, 0);
    open("todos");
    fireEvent.press(await screen.findByTestId("header-apps"));
    fireEvent.press(await screen.findByTestId("switcher-app-finance"));
    expect(router.replace).toHaveBeenCalledWith("/finance");
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByTestId("app-switcher")).toBeNull();
  });

  it("from a sub-screen, it goes down to Home and opens the other app on top", async () => {
    counts(0, 0);
    open("todos", { title: "Groceries", back: true });
    fireEvent.press(await screen.findByTestId("header-apps"));
    fireEvent.press(await screen.findByTestId("switcher-app-notes"));
    expect(router.dismissTo).toHaveBeenCalledWith("/home");
    expect(router.push).toHaveBeenCalledWith("/notes");
  });

  it("Home is reached by going down the stack", async () => {
    counts(0, 0);
    open("todos");
    fireEvent.press(await screen.findByTestId("header-apps"));
    fireEvent.press(await screen.findByTestId("switcher-app-home"));
    expect(router.dismissTo).toHaveBeenCalledWith("/home");
  });

  it("Ask the assistant opens it over the screen", async () => {
    counts(0, 0);
    open("todos");
    fireEvent.press(await screen.findByTestId("header-apps"));
    fireEvent.press(await screen.findByTestId("switcher-ask"));
    expect(router.push).toHaveBeenCalledWith("/chat");
  });

  it("the current app's tile just closes the sheet", async () => {
    counts(0, 0);
    open("todos");
    fireEvent.press(await screen.findByTestId("header-apps"));
    fireEvent.press(await screen.findByTestId("switcher-app-todos"));
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByTestId("app-switcher")).toBeNull();
  });

  it("a double tap on a tile navigates once", async () => {
    counts(0, 0);
    open("todos");
    fireEvent.press(await screen.findByTestId("header-apps"));
    const tile = await screen.findByTestId("switcher-app-calendar");
    fireEvent.press(tile);
    fireEvent.press(tile);
    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  it("a double tap on Apps opens one sheet", async () => {
    counts(0, 0);
    open("todos");
    const apps = await screen.findByTestId("header-apps");
    fireEvent.press(apps);
    fireEvent.press(apps);
    expect(screen.getAllByTestId("app-switcher")).toHaveLength(1);
  });

  it("typing finds an app by its name or its line", async () => {
    counts(0, 0);
    open("todos");
    fireEvent.press(await screen.findByTestId("header-apps"));
    fireEvent.changeText(await screen.findByTestId("switcher-search"), "fin");
    expect(screen.getByTestId("switcher-app-finance")).toBeTruthy();
    expect(screen.queryByTestId("switcher-app-notes")).toBeNull();
    fireEvent.changeText(screen.getByTestId("switcher-search"), "passwords");
    expect(screen.getByTestId("switcher-app-safezone")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("switcher-search"), "zzzz");
    expect(screen.getByText("No app matches")).toBeTruthy();
  });

  it("speaks French", async () => {
    counts(0, 0);
    await i18n.changeLanguage("fr");
    open("todos");
    expect(await screen.findByText("Tâches")).toBeTruthy();
    fireEvent.press(screen.getByTestId("header-apps"));
    expect(await screen.findByPlaceholderText("Trouver une app")).toBeTruthy();
  });
});

describe("the Profile apps list (M6)", () => {
  it("is complete, collapsed at first, checks the current app, and remembers being open", async () => {
    counts(0, 0);
    const first = open("finance");
    fireEvent.press(await screen.findByTestId("header-profile"));
    const toggle = await screen.findByTestId("profile-apps-toggle");
    expect(toggle.props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));
    expect(screen.queryByTestId("profile-app-notes")).toBeNull();
    expect(screen.queryByTestId("profile-open-pages")).toBeNull();

    fireEvent.press(toggle);
    for (const a of APP_REGISTRY) expect(screen.getByTestId(`profile-app-${a.key}`)).toBeTruthy();
    expect(screen.getByTestId("profile-app-finance").props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    await waitFor(async () => expect(await AsyncStorage.getItem("profile_apps_open")).toBe("1"));
    first.unmount();

    open("notes");
    fireEvent.press(await screen.findByTestId("header-profile"));
    expect(await screen.findByTestId("profile-app-notes")).toBeTruthy();
  });

  it("a tap there switches app the same way the sheet does", async () => {
    counts(0, 0);
    await AsyncStorage.setItem("profile_apps_open", "1");
    open("todos");
    fireEvent.press(await screen.findByTestId("header-profile"));
    fireEvent.press(await screen.findByTestId("profile-app-calendar"));
    expect(router.replace).toHaveBeenCalledWith("/calendar");
  });
});
