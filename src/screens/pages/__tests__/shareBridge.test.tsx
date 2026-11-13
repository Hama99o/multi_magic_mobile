/**
 * The share door's router (owner, 2026-11-12): a contact card goes to
 * Contacts, several to the bulk import, a number in a text to "add as a
 * contact", files to Pages as before, and a plain sentence nowhere.
 */
import { Alert } from "react-native";
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
jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() }, usePathname: jest.fn(() => "/home") }));
jest.mock("expo-file-system", () => {
  const files = new Map<string, string>();
  // A file the test names in __missing is not on disk (its copy failed).
  const missing = new Set<string>();
  class File {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return !missing.has(this.uri);
    }
    get size() {
      return missing.has(this.uri) ? 0 : (files.get(this.uri) ?? "x").length;
    }
    async text() {
      return files.get(this.uri) ?? "";
    }
  }
  return { File, Paths: { cache: { uri: "file:///cache" } }, __files: files, __missing: missing };
});

const router = mockedRouter as unknown as { push: jest.Mock; replace: jest.Mock };
const fs = jest.requireMock("expo-file-system") as { __files: Map<string, string>; __missing: Set<string> };
const card = (n: string) => `BEGIN:VCARD\r\nVERSION:3.0\r\nN:;${n};;;\r\nTEL:0701234567\r\nEND:VCARD\r\n`;

beforeEach(() => {
  router.push.mockClear();
  router.replace.mockClear();
  mockReset.mockClear();
  (usePathname as jest.Mock).mockReturnValue("/home");
  useAuthStore.setState({ status: "signedIn" });
  useSharedIntoContacts.setState({ pending: null });
  fs.__files.clear();
  fs.__missing.clear();
  (Alert.alert as jest.Mock).mockClear();
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

it("a file with NO useful type that holds a vCard still goes to Contacts (device, 2026-11-12)", async () => {
  fs.__files.set("content://media/external/file/1000000058", card("Zoe"));
  mockIntent.current = { files: [{ path: "content://media/external/file/1000000058", mimeType: "application/octet-stream", fileName: "1000000058" }], text: null };
  render(<ShareIntentBridge />);
  await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/edit", params: { shared: "1" } }));
  expect(router.push).not.toHaveBeenCalledWith("/pages/save");
});

it("a file with no useful type that is NOT a vCard still goes to Pages", async () => {
  fs.__files.set("content://media/external/file/77", "%PDF-1.7 binary");
  mockIntent.current = { files: [{ path: "content://media/external/file/77", mimeType: "application/octet-stream", fileName: "77" }], text: null };
  render(<ShareIntentBridge />);
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/pages/save"));
});

// ── mixed shares and plain-text vCards (the owner, 2026-11-13) ──────────────
describe("a share mixing contact cards and other files", () => {
  beforeEach(() => usePendingImport.getState().clear());

  it("opens Contacts with the card, and keeps the photo for Pages", async () => {
    fs.__files.set("file:///tmp/Ali.vcf", card("Ali"));
    mockIntent.current = {
      files: [
        { path: "/tmp/Ali.vcf", mimeType: "text/x-vcard", fileName: "Ali.vcf" },
        { path: "/tmp/p.jpg", mimeType: "image/jpeg", fileName: "p.jpg" },
      ],
      text: null,
    };
    render(<ShareIntentBridge />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/edit", params: { shared: "1", rest: "1" } }));
    expect(router.push).not.toHaveBeenCalledWith("/pages/save");
    expect(usePendingImport.getState().files.map((x) => x.name)).toEqual(["p.jpg"]);
  });

  it("several cards and two photos: the bulk import, two left for Pages", async () => {
    fs.__files.set("file:///tmp/a.vcf", card("A"));
    fs.__files.set("file:///tmp/b.vcf", card("B"));
    mockIntent.current = {
      files: [
        { path: "/tmp/a.vcf", mimeType: "text/vcard", fileName: "a.vcf" },
        { path: "/tmp/b.vcf", mimeType: "text/vcard", fileName: "b.vcf" },
        { path: "/tmp/1.jpg", mimeType: "image/jpeg", fileName: "1.jpg" },
        { path: "/tmp/2.mp4", mimeType: "video/mp4", fileName: "2.mp4" },
      ],
      text: null,
    };
    render(<ShareIntentBridge />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/import", params: { shared: "1", rest: "2" } }));
    expect(usePendingImport.getState().files).toHaveLength(2);
  });

  it("signed out: waits, then does the same once signed in", async () => {
    useAuthStore.setState({ status: "signedOut" });
    fs.__files.set("file:///tmp/Ali.vcf", card("Ali"));
    mockIntent.current = {
      files: [
        { path: "/tmp/Ali.vcf", mimeType: "text/x-vcard", fileName: "Ali.vcf" },
        { path: "/tmp/p.jpg", mimeType: "image/jpeg", fileName: "p.jpg" },
      ],
      text: null,
    };
    const view = render(<ShareIntentBridge />);
    await new Promise((r) => setTimeout(r, 50));
    expect(router.push).not.toHaveBeenCalled();
    useAuthStore.setState({ status: "signedIn" });
    view.rerender(<ShareIntentBridge />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/edit", params: { shared: "1", rest: "1" } }));
  });
});

describe("a plain-text file is read before it is sent anywhere", () => {
  it("one whose bytes are a vCard goes to Contacts", async () => {
    fs.__files.set("file:///tmp/contact.txt", card("Mina"));
    mockIntent.current = { files: [{ path: "/tmp/contact.txt", mimeType: "text/plain", fileName: "contact.txt" }], text: null };
    render(<ShareIntentBridge />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/edit", params: { shared: "1" } }));
  });

  it("one that is just text goes to Pages, as before", async () => {
    fs.__files.set("file:///tmp/notes.txt", "a shopping list");
    mockIntent.current = { files: [{ path: "/tmp/notes.txt", mimeType: "text/plain", fileName: "notes.txt" }], text: null };
    render(<ShareIntentBridge />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/pages/save"));
  });
});

// A share whose file could not be read (device pass, 2026-11-13: a cold
// start on the dev build gave "Save to Pages · 1 file · 0 B", and MediaProvider
// refused the read). Never shown or saved silently: said, and let go.
describe("a file that could not be read", () => {
  beforeEach(() => usePendingImport.getState().clear());

  it("0 B: no Contacts, no Pages, nothing pending; the person is told", async () => {
    mockIntent.current = { files: [{ path: "/cache/vcf-devpass.vcf", mimeType: "text/x-vcard", fileName: "vcf-devpass.vcf", size: 0 }], text: null };
    render(<ShareIntentBridge />);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Couldn't read this file", "Try sharing it again."));
    expect(router.push).not.toHaveBeenCalled();
    expect(usePendingImport.getState().files).toHaveLength(0);
    expect(useSharedIntoContacts.getState().pending).toBeNull();
    expect(mockReset).toHaveBeenCalled();
  });

  it("its copy is not on disk: the same", async () => {
    fs.__missing.add("file:///cache/p.jpg");
    mockIntent.current = { files: [{ path: "/cache/p.jpg", mimeType: "image/jpeg", fileName: "p.jpg" }], text: null };
    render(<ShareIntentBridge />);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();
    expect(usePendingImport.getState().files).toHaveLength(0);
  });

  it("from the cold-start landing it goes home rather than leave a blank screen", async () => {
    (usePathname as jest.Mock).mockReturnValue("/share");
    mockIntent.current = { files: [{ path: "/cache/x.vcf", mimeType: "text/x-vcard", fileName: "x.vcf", size: 0 }], text: null };
    render(<ShareIntentBridge />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
  });

  it("one unreadable among readable ones: the rest goes on, and two are counted in the message", async () => {
    fs.__files.set("file:///tmp/Jamil.vcf", card("Jamil"));
    mockIntent.current = {
      files: [
        { path: "/tmp/Jamil.vcf", mimeType: "text/x-vcard", fileName: "Jamil.vcf" },
        { path: "/cache/a.jpg", mimeType: "image/jpeg", fileName: "a.jpg", size: 0 },
        { path: "/cache/b.jpg", mimeType: "image/jpeg", fileName: "b.jpg", size: 0 },
      ],
      text: null,
    };
    render(<ShareIntentBridge />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/edit", params: { shared: "1" } }));
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't read 2 files", "Try sharing them again.");
    expect(usePendingImport.getState().files).toHaveLength(0);
  });

  it("a readable photo with no size in its metadata still goes to Pages (it is checked on disk)", async () => {
    fs.__files.set("file:///tmp/p.jpg", "jpegbytes");
    mockIntent.current = { files: [{ path: "/tmp/p.jpg", mimeType: "image/jpeg", fileName: "p.jpg", size: null }], text: null };
    render(<ShareIntentBridge />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/pages/save"));
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
