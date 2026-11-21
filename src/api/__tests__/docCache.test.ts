/**
 * DOC RESULTS DO NOT OUTLIVE THE SESSION (review 88, D6, 2026-11-21).
 *
 * Every Doc result is written under Paths.cache/doc (`resultDir`, src/api/doc.ts),
 * and nothing ever removed it: after a sign-out, and another account signing in on
 * the same phone, the previous account's signed or merged documents were still on
 * disk. Ending a session (sign-out, a revoked session) deletes that folder, through
 * the same hook as SafeZone's lock (`onSessionEnd`, src/lib/sessionEnd.ts).
 */
const mockDeleted: string[] = [];
const mockExists: { current: boolean } = { current: true };
jest.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
    }
    get exists() {
      return mockExists.current;
    }
    create() {}
    delete() {
      mockDeleted.push(this.uri);
    }
  }
  class File {}
  return { Directory, File, Paths: { cache: { uri: "file:///cache" }, document: { uri: "file:///docs" } }, FileMode: {} };
});

/* eslint-disable import/first */
import "@/api/doc";
import { endSession } from "@/lib/sessionEnd";

beforeEach(() => {
  mockDeleted.length = 0;
  mockExists.current = true;
});

it("ending the session deletes the Doc results folder", () => {
  endSession();
  expect(mockDeleted).toContain("file:///cache/doc");
});

it("with no folder yet, ending the session does not throw and deletes nothing", () => {
  mockExists.current = false;
  expect(() => endSession()).not.toThrow();
  expect(mockDeleted).toEqual([]);
});
