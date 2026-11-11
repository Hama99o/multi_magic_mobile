/**
 * THE DEVICE HALF of Download (`deviceDeps`), against a stand-in
 * expo-file-system that behaves the way the real one was SEEN to on the
 * emulator, 2026-11-10 (qa_phone, Android, a SAF folder "Documents"):
 *
 * 1. `File.copy(dest)` into a file `Directory.createFile` has just made
 *    throws: expo-file-system's SAF strategy (fsops/CopyMoveStrategy.kt,
 *    `prepareAsDestination`) refuses a destination that already exists unless
 *    `overwrite`, and createFile is what made it exist. All three files came
 *    back "could not be saved", each one left behind EMPTY in the folder.
 * 2. `Asset.create(uri)` names the photo after the file it is given, and the
 *    cache file is `pages-<id>-<stamp>-<title>`, so the gallery showed
 *    `pages-3392-20261107001902756-IMG_2041.jpg` instead of `IMG_2041.jpg`.
 */
const created: { name: string; written: number[]; deleted: boolean }[] = [];
const galleryUris: string[] = [];
const io = { failRead: false };

jest.mock("expo-media-library", () => ({
  Asset: { create: jest.fn(async (uri: string) => galleryUris.push(uri)) },
  requestPermissionsAsync: jest.fn(),
}));

jest.mock("expo-file-system", () => {
  const SOURCE = Array.from({ length: 3 * 1024 * 1024 }, (_, i) => i % 7);
  class File {
    uri: string;
    exists = true;
    record?: { name: string; written: number[]; deleted: boolean };
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
    }
    get size() {
      return SOURCE.length;
    }
    copy(dest: File | Directory) {
      // What the real SAF strategy does to a destination that already exists.
      if (dest instanceof File && dest.record) throw new Error("Destination already exists");
      if (dest instanceof File) dest.exists = true;
    }
    open() {
      if (this.record) {
        const record = this.record;
        return { writeBytes: (b: Uint8Array) => b.forEach((x) => record.written.push(x)), close: jest.fn() };
      }
      let at = 0;
      return {
        readBytes: (n: number) => {
          if (io.failRead && at > 0) throw new Error("read failed");
          const chunk = SOURCE.slice(at, at + n);
          at += chunk.length;
          return Uint8Array.from(chunk);
        },
        close: jest.fn(),
      };
    }
    delete() {
      if (this.record) this.record.deleted = true;
      this.exists = false;
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
    delete() {
      this.exists = false;
    }
    createFile(name: string) {
      const file = new File(this.uri, name);
      file.record = { name, written: [], deleted: false };
      created.push(file.record);
      return file;
    }
  }
  return { File, Directory, Paths: { cache: { uri: "cache" } }, FileMode: { ReadOnly: "r", WriteOnly: "w" } };
});

jest.mock("@/api/pages", () => ({
  downloadToCache: jest.fn(async (n: { id: number; title: string }) => `cache/pages-${n.id}-20261107001902756-${n.title}`),
  safeFileName: (t: string) => t,
}));

/* eslint-disable import/first */
import { deviceDeps, COPY_CHUNK_BYTES } from "../downloadMany";
import type { PageNode } from "@/api/pages";

const node = (id: number, title: string, mimeType: string) =>
  ({ id, kind: "file", title, mimeType, attachmentUrl: `https://mm/f/${id}` }) as PageNode;

beforeEach(() => {
  created.length = 0;
  galleryUris.length = 0;
});

it("a SAF folder gets the file's own bytes, under its own name", async () => {
  await deviceDeps.saveInto("content://tree/Documents", node(1, "Trip notes.docx", "application/vnd.openxml"));
  expect(created.map((f) => [f.name, f.written.length, f.deleted])).toEqual([["Trip notes.docx", 3 * 1024 * 1024, false]]);
  expect(created[0].written.slice(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 0]);
});

it("copies in chunks, never the whole file at once (a 500 MB clip must not sit in memory)", () => {
  expect(COPY_CHUNK_BYTES).toBeGreaterThanOrEqual(256 * 1024);
  expect(COPY_CHUNK_BYTES).toBeLessThanOrEqual(8 * 1024 * 1024);
});

it("a file that fails half way is removed, not left behind empty", async () => {
  io.failRead = true;
  try {
    await expect(deviceDeps.saveInto("content://tree/Documents", node(2, "b.pdf", "application/pdf"))).rejects.toThrow();
  } finally {
    io.failRead = false;
  }
  expect(created).toHaveLength(1);
  expect(created[0].deleted).toBe(true);
});

it("the gallery gets the photo under its own name, not the cache's", async () => {
  await deviceDeps.saveToGallery(node(3392, "IMG_2041.jpg", "image/jpeg"));
  expect(galleryUris).toHaveLength(1);
  expect(galleryUris[0]).toMatch(/\/IMG_2041\.jpg$/);
  expect(galleryUris[0]).not.toMatch(/pages-3392/);
});
