/**
 * Finance's tab row (device, 2026-11-25, flow 160): a sideways ScrollView with
 * no indicator. Its five tabs filled the row exactly, so at 360 and 411 dp the
 * BUDGETS tab was wholly off-screen, with nothing to say more lay to the right
 * (Loans was cut to "Lo…" at 360). Hello's decision: keep the scroll, but
 * (1) the next tab always PEEKS, half a tab, so the row reads as "more";
 * (2) the selected tab is scrolled into view; (3) an edge fade over the peek.
 * Jest measures no pixel: the device shots at 360, 411, 200 % and RTL follow.
 */
import MockAdapter from "axios-mock-adapter";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { StyleSheet } from "react-native";
import { testQueryClient } from "@/__tests__/queryClient";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { tabLayout, tabScrollX } from "../tabRow";

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
  Link: ({ children }: { children: unknown }) => children,
}));

/* eslint-disable import/first */
import Finance from "../../../../app/finance";
/* eslint-enable import/first */

describe("the tab row's arithmetic", () => {
  it("on a phone, whole tabs and HALF of the next one fit: the row says there is more", () => {
    for (const row of [300, 340]) {
      const { width, scrolls } = tabLayout(row, 5, 1);
      expect(scrolls).toBe(true);
      const shown = row / width;
      expect(shown - Math.floor(shown)).toBeCloseTo(0.5, 5);
    }
  });

  it("at 200 % the tabs are wider and still peek", () => {
    const { width, scrolls } = tabLayout(340, 5, 2);
    expect(scrolls).toBe(true);
    expect(width).toBeGreaterThan(tabLayout(340, 5, 1).width);
    expect((340 / width) % 1).toBeCloseTo(0.5, 5);
  });

  it("when every tab fits (a tablet) they share the row and nothing scrolls", () => {
    expect(tabLayout(720, 5, 1)).toEqual({ width: 144, scrolls: false });
  });

  it("the selected tab is scrolled into view, never past the end", () => {
    const { width } = tabLayout(340, 5, 1);
    expect(tabScrollX(0, width, 340, 5)).toBe(0);
    const last = tabScrollX(4, width, 340, 5);
    expect(last).toBeGreaterThan(0);
    expect(4 * width).toBeGreaterThanOrEqual(last);
    expect(5 * width).toBeLessThanOrEqual(last + 340 + 0.001);
  });
});

describe("the tab row on screen", () => {
  let mock: MockAdapter;
  beforeEach(() => {
    mock = new MockAdapter(http);
    mock.onAny().reply(200, {});
    __resetTokenCache();
    __resetFingerprintCache();
  });
  afterEach(() => {
    mock.restore();
    jest.restoreAllMocks();
  });

  function open(tab: string) {
    mockParams.current = { tab };
    jest.spyOn(require("react-native"), "useWindowDimensions").mockReturnValue({ width: 360, height: 800, scale: 3, fontScale: 1 });
    render(
      <QueryClientProvider client={testQueryClient()}>
        <Finance />
      </QueryClientProvider>,
    );
    const row = screen.getByTestId("finance-tabs");
    act(() => {
      fireEvent(row, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 48 } } });
    });
    return screen.getByTestId("finance-tabs");
  }

  it("opened on Budgets, the row starts scrolled to it, and a fade marks the edge", () => {
    const row = open("budgets");
    const { width } = tabLayout(300, 5, 1);
    expect(row.props.contentOffset).toEqual({ x: tabScrollX(4, width, 300, 5), y: 0 });
    expect(row.props.contentOffset.x).toBeGreaterThan(0);
    expect(StyleSheet.flatten(screen.getByTestId("finance-tab-button-budgets").props.style).width).toBeCloseTo(width, 5);
    expect(screen.getByTestId("finance-tabs-fade-start")).toBeTruthy();
  });

  it("opened on Overview, the row starts at 0 and the fade sits over the peek at the end", () => {
    const row = open("overview");
    expect(row.props.contentOffset).toEqual({ x: 0, y: 0 });
    expect(screen.getByTestId("finance-tabs-fade-end")).toBeTruthy();
    expect(screen.queryByTestId("finance-tabs-fade-start")).toBeNull();
  });
});
