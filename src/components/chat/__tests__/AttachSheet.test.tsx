/**
 * The attach sheet says the limits BEFORE the picker opens.
 *
 * A person who picks a 14 MB scan and is then told "under 10 MB" has done the
 * work twice. Every number and every type in the sentence is the server's
 * (`AiDocument::MAX_BYTES`, `MAX_PER_CONVERSATION`, `ALLOWED_EXTENSIONS`),
 * read from the same constants the refusal uses — so the sentence and the
 * refusal cannot disagree.
 */
import { render, screen } from "@testing-library/react-native";
import { AttachSheet, describeAllowedTypes } from "../AttachSheet";
import { ALLOWED_UPLOAD_EXTENSIONS, LIMITS } from "@/api/ai";

const noop = () => {};

function renderSheet(fileCount = 0) {
  return render(
    <AttachSheet
      visible
      fileCount={fileCount}
      onClose={noop}
      onPickImage={noop}
      onTakePhoto={noop}
      onPickDocument={noop}
    />,
  );
}

describe("the limits line", () => {
  it("names the file cap and the size cap", () => {
    renderSheet();

    // Regexes: this library's `toHaveTextContent` is an EXACT match for a
    // string, and the line carries more than one fact.
    const line = screen.getByTestId("attach-limits");
    expect(line).toHaveTextContent(new RegExp(`Up to ${LIMITS.maxFilesPerSession} files`));
    expect(line).toHaveTextContent(new RegExp(`${LIMITS.maxFileBytes / (1024 * 1024)} MB`));
  });

  it("names every type the endpoint accepts, from the enforced list", () => {
    renderSheet();

    const line = screen.getByTestId("attach-limits");
    for (const ext of ALLOWED_UPLOAD_EXTENSIONS) {
      expect(line).toHaveTextContent(new RegExp(`\\b${ext.toUpperCase()}\\b`));
    }
    expect(ALLOWED_UPLOAD_EXTENSIONS).toHaveLength(9);
    expect(describeAllowedTypes()).toBe("PDF, PNG, JPG, JPEG, WEBP, GIF, HEIC, HEIF, CSV");
  });

  it("is present before any file has been added", () => {
    renderSheet(0);

    expect(screen.getByTestId("attach-limits")).toBeTruthy();
    expect(screen.queryByTestId("attach-count")).toBeNull();
  });

  it("counts against the cap while the conversation fills up", () => {
    renderSheet(17);

    expect(screen.getByTestId("attach-count")).toHaveTextContent("17 of 20 files");
  });
});

describe("the three ways a person has a file", () => {
  it("are all offered", () => {
    renderSheet();

    expect(screen.getByTestId("attach-photo")).toBeTruthy();
    expect(screen.getByTestId("attach-camera")).toBeTruthy();
    expect(screen.getByTestId("attach-document")).toBeTruthy();
  });
});
