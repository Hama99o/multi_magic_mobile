/**
 * MAKING A SPACE ON THE PHONE (audit P0 #1, 2026-11-16). Before, the Files
 * tab said "Create a space on the web" and the save picker was blank with no
 * space. The form is the web's `SpaceFormPanel.tsx`: a title (required), a
 * description, one of its sixteen icons (📁 by default) and a note colour or
 * none; it sends exactly `space_params` (`spaces_controller.rb`).
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { testQueryClient } from "@/__tests__/queryClient";

const page = (rows: unknown[]) => ({ rows, hasMore: false, unreadable: 0, total: rows.length });
const trips = { id: 999, title: "Trips", icon: "🚀", description: null, color: "teal", nodesCount: 0, ownerName: null, permission: null, totalFileSize: null, updatedAt: "2026-11-16T10:00:00Z" };

const mockApi = {
  spaces: jest.fn(async () => page([])),
  sharedWithMe: jest.fn(async () => page([])),
  drive: jest.fn(async () => page([])),
  children: jest.fn(async () => page([])),
  createSpace: jest.fn(async () => trips),
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: new Proxy({}, { get: (_t, key: string) => (...a: unknown[]) => (mockApi as Record<string, (...x: unknown[]) => unknown>)[key](...a) }),
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ tab: "files" }),
}));

/* eslint-disable import/first */
import PagesHome from "../../../../app/pages/index";
import SaveToPages from "../../../../app/pages/save";
import { usePendingImport } from "../addFiles";

function wrap(node: React.ReactElement) {
  return render(<QueryClientProvider client={testQueryClient()}>{node}</QueryClientProvider>);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe("the Files tab with no space", () => {
  it("offers New space instead of sending him to the web", async () => {
    wrap(<PagesHome />);
    expect(await screen.findByTestId("pages-no-spaces")).toBeTruthy();
    expect(screen.queryByText(/on the web/)).toBeNull();
    expect(screen.getByTestId("pages-new-space")).toBeTruthy();
  });

  it("the form needs a title, then creates the space with its icon and colour", async () => {
    wrap(<PagesHome />);
    fireEvent.press(await screen.findByTestId("pages-new-space"));
    const create = await screen.findByTestId("pages-space-create");
    expect(create.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.changeText(screen.getByTestId("pages-space-title"), "  Trips ");
    fireEvent.press(screen.getByTestId("pages-space-icon-🚀"));
    fireEvent.press(screen.getByTestId("pages-space-color-teal"));
    await act(async () => fireEvent.press(screen.getByTestId("pages-space-create")));
    expect(mockApi.createSpace).toHaveBeenCalledWith({ title: "Trips", description: "", icon: "🚀", color: "teal" });
    await waitFor(() => expect(screen.queryByTestId("pages-space-form")).toBeNull());
    // The list is asked again, so the new space shows at the top.
    await waitFor(() => expect(mockApi.spaces.mock.calls.length).toBeGreaterThan(1));
  });

  it("📁 and no colour by default, as on the web", async () => {
    wrap(<PagesHome />);
    fireEvent.press(await screen.findByTestId("pages-new-space"));
    fireEvent.changeText(await screen.findByTestId("pages-space-title"), "Work");
    await act(async () => fireEvent.press(screen.getByTestId("pages-space-create")));
    expect(mockApi.createSpace).toHaveBeenCalledWith({ title: "Work", description: "", icon: "📁", color: "" });
  });

  it("a refusal is said in the form, which stays open", async () => {
    mockApi.createSpace.mockRejectedValueOnce(new Error("boom"));
    wrap(<PagesHome />);
    fireEvent.press(await screen.findByTestId("pages-new-space"));
    fireEvent.changeText(await screen.findByTestId("pages-space-title"), "Work");
    await act(async () => fireEvent.press(screen.getByTestId("pages-space-create")));
    expect(await screen.findByTestId("pages-space-error")).toBeTruthy();
    expect(screen.getByTestId("pages-space-form")).toBeTruthy();
  });
});

it("the + sheet on the Pages home offers New space too", async () => {
  wrap(<PagesHome />);
  fireEvent.press(await screen.findByTestId("pages-add"));
  expect(await screen.findByTestId("pages-new-sheet-space")).toBeTruthy();
});

describe("the save picker with no space", () => {
  beforeEach(() => {
    usePendingImport.setState({ files: [{ uri: "file:///cache/IMG_0042.JPG", name: "IMG_0042.JPG", mimeType: "image/jpeg", size: 1000 }] });
  });

  it("offers New space; the new space is entered, ready to upload into", async () => {
    wrap(<SaveToPages />);
    fireEvent.press(await screen.findByTestId("pages-save-new-space"));
    fireEvent.changeText(await screen.findByTestId("pages-space-title"), "Trips");
    await act(async () => fireEvent.press(screen.getByTestId("pages-space-create")));
    expect(await screen.findByText("Saving to Trips")).toBeTruthy();
    expect(screen.getByTestId("pages-save-here").props.accessibilityState).toMatchObject({ disabled: false });
  });
});
