/**
 * "Share / Save" (ItemSheet.shareNode) hands the file to the system sheet,
 * where iOS's "Save Image" / "Save Video" and Android's apps decide what the
 * file is from its type AND its name. A photo titled "IMG_2041" stored as
 * octet-stream (the owner, 2026-11-12) is shared as image/jpeg, under
 * "IMG_2041.jpg".
 */
const mockCopies: { from: string; to: string }[] = [];
let mockHead: number[] = [];

jest.mock("expo-file-system", () => {
  class File {
    uri: string;
    exists = false;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
    }
    open() {
      return { readBytes: () => Uint8Array.from(mockHead), close: jest.fn() };
    }
    copy(dest: { uri: string }) {
      mockCopies.push({ from: this.uri, to: dest.uri });
    }
  }
  class Directory {
    uri: string;
    exists = false;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
    }
    create() {
      this.exists = true;
    }
  }
  return { File, Directory, Paths: { cache: { uri: "cache" } }, FileMode: { ReadOnly: "r" } };
});
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("@/api/pages", () => ({
  downloadToCache: jest.fn(async (n: { id: number; title: string }) => `cache/pages-${n.id}-1-${n.title}`),
  safeFileName: (t: string) => t,
}));

/* eslint-disable import/first */
import * as Sharing from "expo-sharing";
import { shareNode } from "../ItemSheet";
import type { PageNode } from "@/api/pages";

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46];
const node = (title: string, mimeType: string | null) =>
  ({ id: 9, kind: "file", title, mimeType, attachmentUrl: "https://mm/f/9", updatedAt: "2026-11-12T10:00:00Z" }) as PageNode;

beforeEach(() => {
  mockCopies.length = 0;
  mockHead = [];
  (Sharing.shareAsync as jest.Mock).mockClear();
});

it("a photo stored as octet-stream is shared as the JPEG its bytes say, named IMG_2041.jpg", async () => {
  mockHead = JPEG;
  await shareNode(node("IMG_2041", "application/octet-stream"));
  const [uri, options] = (Sharing.shareAsync as jest.Mock).mock.calls[0];
  expect(options.mimeType).toBe("image/jpeg");
  expect(uri).toMatch(/\/IMG_2041\.jpg$/);
});

it("a typed file with no extension in its title gets one", async () => {
  await shareNode(node("1000017023", "video/mp4"));
  expect((Sharing.shareAsync as jest.Mock).mock.calls[0][0]).toMatch(/\/1000017023\.mp4$/);
});

it("a file already named right is shared straight from the cache, no copy", async () => {
  await shareNode(node("IMG_2041.jpg", "image/jpeg"));
  expect(mockCopies).toHaveLength(0);
  expect((Sharing.shareAsync as jest.Mock).mock.calls[0][0]).toBe("cache/pages-9-1-IMG_2041.jpg");
});
