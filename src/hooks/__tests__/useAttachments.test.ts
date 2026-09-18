/**
 * What the picker will and will not accept — checked before the request, so a
 * person meets our sentence rather than the server's 422.
 */
import { rejectionFor, describeSize } from "../useAttachments";
import { ALLOWED_UPLOAD_EXTENSIONS, LIMITS } from "@/api/ai";

const MB = 1024 * 1024;

describe("the allowed list", () => {
  // ── THE LIST IS THE MODEL'S, NOT THE EXTRACTOR'S ──────────────────────────
  //
  // `Ai::FileExtractor` reads .docx and .xlsx happily; `AiDocument` rejects
  // them. Offering what the extractor can read produces a file the picker
  // accepted and the server then 422s — which is the failure this check exists
  // to prevent, pointed the right way round.
  it("refuses .docx and .xlsx, which the EXTRACTOR can read but the endpoint rejects", () => {
    expect(rejectionFor({ name: "notes.docx", size: 1000 }, 0)).toMatch(/not one of those/);
    expect(rejectionFor({ name: "budget.xlsx", size: 1000 }, 0)).toMatch(/not one of those/);
  });

  it.each([...ALLOWED_UPLOAD_EXTENSIONS])("accepts .%s", (ext) => {
    expect(rejectionFor({ name: `file.${ext}`, size: 1000 }, 0)).toBeNull();
  });

  // HEIC is the iPhone camera default. An app that rejects the format its own
  // users' cameras produce is the kind of thing found after launch.
  it("accepts HEIC, which is what an iPhone camera actually produces", () => {
    expect(rejectionFor({ name: "IMG_0001.HEIC", size: 2 * MB }, 0)).toBeNull();
  });

  // The server falls back to the extension for exactly this reason: a .csv from
  // Excel arrives as application/vnd.ms-excel.
  it("judges by extension, not by case", () => {
    expect(rejectionFor({ name: "SCAN.PDF", size: 1000 }, 0)).toBeNull();
  });

  it("refuses a file with no extension rather than guessing", () => {
    expect(rejectionFor({ name: "scan", size: 1000 }, 0)).toMatch(/not one of those/);
  });
});

describe("the limits", () => {
  it("refuses a file over 10 MB and says how big it was", () => {
    const refusal = rejectionFor({ name: "big.pdf", size: 11 * MB }, 0);
    expect(refusal).toMatch(/11\.0 MB/);
    expect(refusal).toMatch(/under 10 MB/);
  });

  it("allows one exactly at the cap", () => {
    expect(rejectionFor({ name: "edge.pdf", size: LIMITS.maxFileBytes }, 0)).toBeNull();
  });

  it("refuses a 21st file, naming the cap", () => {
    const refusal = rejectionFor({ name: "one-more.pdf", size: 1000 }, LIMITS.maxFilesPerSession);
    expect(refusal).toMatch(/20 files/);
  });

  // The count check comes first: "this conversation is full" is more useful
  // than "that file is the wrong type" when both are true.
  it("reports the fullest conversation before the file's own problems", () => {
    expect(rejectionFor({ name: "bad.docx", size: 99 * MB }, 20)).toMatch(/already has 20 files/);
  });
});

describe("describeSize", () => {
  it("reads the way a person would say it", () => {
    expect(describeSize(512)).toBe("512 B");
    expect(describeSize(2048)).toBe("2 KB");
    expect(describeSize(3 * MB)).toBe("3.0 MB");
  });
});
