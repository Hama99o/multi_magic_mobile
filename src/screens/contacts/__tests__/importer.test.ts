/**
 * Bulk import (SPEC §C.7): cards go in chunks of 50 so the bar is real
 * progress; the summaries add up; a dropped connection stops at the chunk
 * that failed and can resume THERE (resending a sent chunk would be harmless —
 * the server skips duplicates — but it would count them as "already there").
 */
import { ImportNotSupported } from "@/api/contacts";
import { addResults, runImport, splitCards, EMPTY_RESULT } from "../importer";

const result = (created: number, skipped = 0, failed = 0, names: string[] = []) => ({
  created, skipped, failed, total: created + skipped + failed, skippedNames: names, failedNames: [],
});

describe("splitCards", () => {
  it("cuts a file into whole cards, whatever the line endings and case", () => {
    const vcf = "BEGIN:VCARD\r\nFN:A\r\nEND:VCARD\r\nbegin:vcard\nFN:B\nend:vcard\njunk\nBEGIN:VCARD\nFN:C\nEND:VCARD";
    expect(splitCards(vcf)).toEqual(["BEGIN:VCARD\r\nFN:A\r\nEND:VCARD\r\n", "begin:vcard\nFN:B\nend:vcard\n", "BEGIN:VCARD\nFN:C\nEND:VCARD\r\n"]);
  });

  it("finds nothing in a file that is not a vCard", () => {
    expect(splitCards("hello")).toEqual([]);
  });

  it("drops a byte-order mark before the first card", () => {
    expect(splitCards("﻿BEGIN:VCARD\nFN:A\nEND:VCARD\n")).toHaveLength(1);
  });
});

describe("addResults", () => {
  it("adds counts and names", () => {
    expect(addResults(result(2, 1, 0, ["x"]), result(3, 0, 1))).toEqual({
      created: 5, skipped: 1, failed: 1, total: 7, skippedNames: ["x"], failedNames: [],
    });
  });
});

describe("runImport", () => {
  const cards = Array.from({ length: 120 }, (_, i) => `BEGIN:VCARD\r\nFN:P${i}\r\nEND:VCARD\r\n`);

  it("sends 50, 50, 20 and reports progress after each chunk", async () => {
    const sent: number[] = [];
    const progress: number[] = [];
    const send = jest.fn(async (vcf: string) => {
      const n = (vcf.match(/BEGIN:VCARD/g) ?? []).length;
      sent.push(n);
      return result(n);
    });
    const outcome = await runImport(cards, { send, onProgress: (done) => progress.push(done) });

    expect(sent).toEqual([50, 50, 20]);
    expect(progress).toEqual([0, 50, 100, 120]);
    expect(outcome).toEqual({ status: "done", result: result(120), sent: 120 });
  });

  it("stops at the chunk that failed and resumes from it", async () => {
    let calls = 0;
    const send = jest.fn(async (vcf: string) => {
      calls += 1;
      if (calls === 2) throw new Error("Network Error");
      return result((vcf.match(/BEGIN:VCARD/g) ?? []).length);
    });
    const first = await runImport(cards, { send, onProgress: () => undefined });
    expect(first).toMatchObject({ status: "stopped", sent: 50, result: result(50) });

    const second = await runImport(cards, { send, onProgress: () => undefined, from: first.sent, so: first.result });
    expect(second).toEqual({ status: "done", sent: 120, result: result(120) });
  });

  it("gives up at once on a one-card server, saying so, rather than send 6 chunks for 6 contacts", async () => {
    const send = jest.fn(async () => {
      throw new ImportNotSupported();
    });
    const outcome = await runImport(cards, { send, onProgress: () => undefined });
    expect(outcome.status).toBe("unsupported");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does nothing for nothing", async () => {
    const send = jest.fn();
    expect(await runImport([], { send, onProgress: () => undefined })).toEqual({ status: "done", sent: 0, result: EMPTY_RESULT });
    expect(send).not.toHaveBeenCalled();
  });
});
