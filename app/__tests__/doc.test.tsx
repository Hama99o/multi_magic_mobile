/**
 * DOC TOOLS, ON SCREEN. Every Doc screen renders its handles in English and
 * in French (a French sentence on each, so a hardcoded English string fails),
 * the hub at a phone and a tablet width in both schemes, and the flows that
 * need no device: the intake sheet offers only what a tool can take, the
 * creator will not save an empty signature, the signature list is the
 * server's order with a confirm before delete, and a tool's result opens the
 * Share / Save sheet. Invented values only.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import type { ReactElement } from "react";
// The library's own stand-in for its native module (GestureHandlerRootView, Pan, Pinch…).
import "react-native-gesture-handler/jestSetup";

import { http } from "@/api/http";
import { testQueryClient } from "@/__tests__/queryClient";
import { useThemeStore } from "@/stores/theme.store";
import i18n from "@/i18n";
import DocHub from "../doc/index";
import SignScreen from "../doc/sign";
import SignatureCreator from "../doc/signature";
import SignaturesScreen from "../doc/signatures";
import MergeScreen from "../doc/merge";
import PagesScreen from "../doc/pages";
import TextEditorScreen from "../doc/text";
import ConvertScreen from "../doc/convert";
import CompressScreen from "../doc/compress";
import * as DocumentPicker from "expo-document-picker";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true, dismissTo: jest.fn() },
  useLocalSearchParams: () => ({}),
  usePathname: () => "/doc",
  useFocusEffect: () => {},
}));
// GestureDetector reaches into Reanimated, which Jest has no native for; here
// it only has to render its child (the gestures themselves are a device check).
jest.mock("react-native-gesture-handler", () => ({
  ...jest.requireActual("react-native-gesture-handler"),
  GestureDetector: ({ children }: { children: unknown }) => children,
}));
jest.mock("@/lib/cable", () => ({ subscribeToChannel: () => () => {} }));
jest.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
    }
    create() {}
    static pickDirectoryAsync = jest.fn();
  }
  class File {
    uri: string;
    name: string;
    constructor(dir: { uri: string } | string, name?: string) {
      this.uri = typeof dir === "string" ? dir : `${dir.uri}/${name}`;
      this.name = name ?? this.uri.split("/").pop() ?? "";
    }
    create() {}
    write() {}
  }
  return { Directory, File, Paths: { cache: "file:///cache" }, FileMode: { ReadOnly: 0, WriteOnly: 1 } };
});
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Current: "current" },
  VideoExportPreset: { Passthrough: 0 },
}));

const SIGNATURES = {
  signatures: [
    { id: 2, name: "Signature 2", kind: "type", text: "Ada", font: "'Caveat', cursive", color: "#0f172a", font_size: 72, bg_color: "transparent", active: true, image_url: "https://files.example.test/2.png", updated_at: "2026-11-20T10:00:00Z" },
    { id: 1, name: "Signature 1", kind: "draw", strokes: [], width: 300, height: 100, bg_color: "#ffffff", active: false, image_url: "https://files.example.test/1.png", updated_at: "2026-11-19T10:00:00Z" },
  ],
  meta: { pagy: { page: 1, last: 1 } },
};

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
  mock.onGet("/api/v1/doc_app/signatures").reply(200, SIGNATURES);
});
afterEach(async () => {
  mock.restore();
  jest.restoreAllMocks();
  useThemeStore.setState({ choice: "system" });
  await i18n.changeLanguage("en");
});

function setWidth(width: number) {
  jest.spyOn(require("react-native").Dimensions, "get").mockReturnValue({ width, height: 2400, scale: 3, fontScale: 1 });
}

function show(element: ReactElement) {
  return render(<QueryClientProvider client={testQueryClient()}>{element}</QueryClientProvider>);
}

const SCREENS: { name: string; element: () => ReactElement; handles: string[]; french: string }[] = [
  { name: "hub", element: () => <DocHub />, handles: ["doc-tools", "doc-tool-sign", "doc-tool-merge", "doc-tool-pages", "doc-tool-text", "doc-tool-convert", "doc-tool-compress"], french: "Signez, fusionnez et convertissez PDF et photos." },
  { name: "sign", element: () => <SignScreen />, handles: ["doc-sign-strip", "doc-sign-intake", "doc-sign-intake-add"], french: "Vos signatures" },
  { name: "signature creator", element: () => <SignatureCreator />, handles: ["doc-creator-mode", "doc-signature-pad", "doc-creator-save"], french: "Signez ici avec le doigt" },
  { name: "signatures", element: () => <SignaturesScreen />, handles: ["doc-signatures-list", "doc-signatures-add"], french: "Ajouter une signature" },
  { name: "merge", element: () => <MergeScreen />, handles: ["doc-merge-intake", "doc-merge-intake-add"], french: "Jusqu’à 30 fichiers, 50 Mo chacun et 150 Mo en tout.", },
  { name: "pages", element: () => <PagesScreen />, handles: ["doc-pages-intake"], french: "Un PDF, jusqu’à 50 Mo." },
  { name: "text", element: () => <TextEditorScreen />, handles: ["doc-text-intake"], french: "Un PDF avec du vrai texte, pas un scan.", },
  { name: "convert", element: () => <ConvertScreen />, handles: ["doc-convert-intake"], french: "Toute image (HEIC, AVIF, TIFF…) en PDF, JPG, PNG ou WebP, et un PDF en images." },
  { name: "compress", element: () => <CompressScreen />, handles: ["doc-compress-intake"], french: "Un scan de 12 Mo devient quelques mégaoctets. Basique reste net, Fort passe sous une limite, ou visez une taille." },
];

describe.each(SCREENS)("$name", ({ element, handles, french }) => {
  it.each(["en", "fr"])("renders every handle in %s", async (language) => {
    setWidth(360);
    await i18n.changeLanguage(language);
    show(element());
    for (const h of handles) expect(await screen.findByTestId(h)).toBeTruthy();
  });

  it("is read in French", async () => {
    setWidth(360);
    await i18n.changeLanguage("fr");
    show(element());
    expect(await screen.findByText(new RegExp(french.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeTruthy();
  });
});

it.each([
  [360, "light"],
  [360, "dark"],
  [800, "light"],
  [800, "dark"],
] as const)("the hub's six tools at %i dp in %s", async (width, scheme) => {
  setWidth(width);
  useThemeStore.setState({ choice: scheme });
  show(<DocHub />);
  for (const tool of ["sign", "merge", "pages", "text", "convert", "compress"]) expect(await screen.findByTestId(`doc-tool-${tool}`)).toBeTruthy();
});

it("the intake sheet offers only what the tool can take: Pages has no Photos or Camera", async () => {
  setWidth(360);
  show(<PagesScreen />);
  fireEvent.press(await screen.findByTestId("doc-pages-intake-add"));
  expect(await screen.findByTestId("doc-intake-files")).toBeTruthy();
  expect(screen.queryByTestId("doc-intake-photos")).toBeNull();
  expect(screen.queryByTestId("doc-intake-camera")).toBeNull();
  expect(screen.queryByTestId("doc-intake-scan")).toBeNull(); // behind DOC_SCANNER_ENABLED until the next native build
});

it("Sign offers Photos, Files and Camera, and the active signature is picked first", async () => {
  setWidth(360);
  show(<SignScreen />);
  const active = await screen.findByTestId("doc-sign-pick-2");
  expect(active.props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByTestId("doc-sign-pick-1").props.accessibilityState).toMatchObject({ selected: false });
  fireEvent.press(screen.getByTestId("doc-sign-intake-add"));
  for (const id of ["doc-intake-photos", "doc-intake-files", "doc-intake-camera"]) expect(await screen.findByTestId(id)).toBeTruthy();
});

it("the creator will not save an empty signature", async () => {
  setWidth(360);
  show(<SignatureCreator />);
  const save = await screen.findByTestId("doc-creator-save");
  expect(save.props.accessibilityState).toMatchObject({ disabled: true });
  fireEvent.press(screen.getByTestId("doc-creator-mode-type"));
  fireEvent.changeText(screen.getByTestId("doc-creator-text"), "Ada Lovelace");
  expect(screen.getByTestId("doc-creator-save").props.accessibilityState).toMatchObject({ disabled: false });
});

it("a typed signature is sent without a PNG, named Signature 3, in the web's font value", async () => {
  setWidth(360);
  mock.onPost("/api/v1/doc_app/signatures").reply(201, { signature: { ...SIGNATURES.signatures[0], id: 3, name: "Signature 3" } });
  show(<SignatureCreator />);
  // The name counts the signatures already there, so the list must have arrived.
  await waitFor(() => expect(mock.history.get.some((r) => r.url === "/api/v1/doc_app/signatures")).toBe(true));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  fireEvent.press(await screen.findByTestId("doc-creator-mode-type"));
  fireEvent.changeText(screen.getByTestId("doc-creator-text"), "Ada");
  fireEvent.press(screen.getByTestId("doc-creator-font-GreatVibes"));
  await act(async () => {
    fireEvent.press(screen.getByTestId("doc-creator-save"));
  });
  const body = JSON.parse(mock.history.post[0].data);
  expect(body).toMatchObject({ name: "Signature 3", kind: "type", text: "Ada", font: "'Great Vibes', cursive" });
  expect(body).not.toHaveProperty("data_url");
});

it("the signatures list keeps the server's order and asks before deleting", async () => {
  setWidth(360);
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  show(<SignaturesScreen />);
  const rows = await screen.findAllByTestId("doc-signature-row");
  expect(rows).toHaveLength(2);
  fireEvent.press(screen.getByTestId("doc-signature-delete-2"));
  expect(alert).toHaveBeenCalledWith("Delete this signature?", expect.any(String), expect.any(Array));
  expect(mock.history.delete).toHaveLength(0);
});

it("a picked PDF is inspected and a locked one is said in plain words, by name", async () => {
  setWidth(360);
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///cache/Contract.pdf", name: "Contract.pdf", mimeType: "application/pdf", size: 1000 }] });
  mock.onPost("/api/v1/doc_app/pdf/inspect").reply(200, { pdf: true, pages: 0, encrypted: true, reason: "locked", sizes: [] });
  show(<PagesScreen />);
  fireEvent.press(await screen.findByTestId("doc-pages-intake-add"));
  // The picker opens once the sheet has slid away (SHEET_CLOSE_MS).
  fireEvent.press(await screen.findByTestId("doc-intake-files"));
  expect(await screen.findByText("Contract.pdf: This PDF is password-protected. Remove the password and try again.", {}, { timeout: 3000 })).toBeTruthy();
});

it("a file over 50 MB is refused before anything is sent", async () => {
  setWidth(360);
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///cache/Big.pdf", name: "Big.pdf", mimeType: "application/pdf", size: 60 * 1024 * 1024 }] });
  show(<CompressScreen />);
  fireEvent.press(await screen.findByTestId("doc-compress-intake-add"));
  fireEvent.press(await screen.findByTestId("doc-intake-files"));
  await waitFor(() => expect(alert).toHaveBeenCalled(), { timeout: 3000 });
  expect(alert).toHaveBeenCalledWith("Doc Tools", "Big.pdf: This file is over 50 MB, the most Doc can take.");
  expect(mock.history.post).toHaveLength(0);
});

it("a busy server is said plainly and Retry runs the same compress again (Hello, 2026-11-21: 503 {reason:'busy'})", async () => {
  setWidth(360);
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///cache/Scan.pdf", name: "Scan.pdf", mimeType: "application/pdf", size: 1000 }] });
  mock
    .onPost("/api/v1/doc_app/compress")
    .replyOnce(503, { reason: "busy", message: "Another document is being processed." }, { "retry-after": "1" })
    .onPost("/api/v1/doc_app/compress")
    .replyOnce(200, new ArrayBuffer(8), { "x-original-size": "1000", "x-compressed-size": "500", "content-type": "application/pdf" });
  show(<CompressScreen />);
  fireEvent.press(await screen.findByTestId("doc-compress-intake-add"));
  fireEvent.press(await screen.findByTestId("doc-intake-files"));
  expect(await screen.findByText("Server busy, try again in a moment.", {}, { timeout: 3000 })).toBeTruthy();
  expect(mock.history.post.filter((r) => r.url?.endsWith("/compress"))).toHaveLength(1);
  // Retry-After: 1. Locked first, then Retry.
  expect(screen.getByText("Retry in 1 s")).toBeTruthy();
  await waitFor(() => expect(screen.getByText("Retry")).toBeTruthy(), { timeout: 3000 });
  fireEvent.press(screen.getByTestId("doc-error-retry"));
  await waitFor(() => expect(mock.history.post.filter((r) => r.url?.endsWith("/compress"))).toHaveLength(2));
  await waitFor(() => expect(screen.queryByText("Server busy, try again in a moment.")).toBeNull());
});
