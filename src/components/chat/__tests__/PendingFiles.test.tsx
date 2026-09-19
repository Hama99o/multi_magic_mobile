/**
 * THE CHIPS ABOVE THE COMPOSER — the other component no test had mounted.
 *
 * `qa/UNWALKED.md` §2. `pending-files`, `pending-file-*`,
 * `pending-file-remove-*` and `pending-files-more` were named by no flow and no
 * test, and nothing rendered `PendingFiles` at all. `05-upload` reaches the
 * attach sheet and stops there — the system picker is outside the app — so
 * everything that happens to a file AFTER it is chosen was unwalked.
 *
 * ── THE TWO CLAIMS IN THE HEADER, ASSERTED AS BEHAVIOUR ───────────────────
 * The component's header makes two promises that are easy to break and
 * expensive to break:
 *
 *   1. **A failed upload stays on screen as failed** — "a file that vanishes
 *      looks like one that uploaded". Somebody then asks a question about a
 *      document the assistant has never received.
 *   2. **The strip collapses past two** — twenty chips would push the composer
 *      off a 360 dp screen, which means the thing the person came to do
 *      disappears behind the things they added to it.
 *
 * `docs/TESTING.md` §5: a promise in a header is prose until something fails
 * when it is broken.
 */
import { render, screen, fireEvent } from "@testing-library/react-native";
import { PendingFiles } from "../PendingFiles";
import type { PendingFile } from "@/hooks/useAttachments";

const file = (over: Partial<PendingFile> = {}): PendingFile => ({
  key: "k1",
  name: "lease.pdf",
  uri: "file:///lease.pdf",
  mimeType: "application/pdf",
  size: 1024 * 1024,
  status: "done",
  ...over,
});

const many = (n: number) =>
  Array.from({ length: n }, (_, i) => file({ key: `k${i}`, name: `file-${i}.pdf` }));

describe("files queued onto a question that has not been sent", () => {
  it("shows nothing when nothing is queued", () => {
    render(<PendingFiles files={[]} onRemove={jest.fn()} />);
    expect(screen.queryByTestId("pending-files")).toBeNull();
  });

  it("KEEPS a failed upload on screen, as failed", () => {
    // The whole point. A chip that disappears on failure is indistinguishable
    // from one that succeeded, and the next thing the person does is ask about
    // a document the assistant was never given.
    render(<PendingFiles files={[file({ status: "failed" })]} onRemove={jest.fn()} />);
    expect(screen.getByTestId("pending-file-failed")).toBeTruthy();
    expect(screen.getByText("Did not upload")).toBeTruthy();
    expect(screen.getByText("lease.pdf")).toBeTruthy();
  });

  it("carries the server's own reason when it sent one", () => {
    render(
      <PendingFiles files={[file({ status: "failed", error: "That file is too big." })]} onRemove={jest.fn()} />,
    );
    expect(screen.getByText("That file is too big.")).toBeTruthy();
  });

  it("says a file is still uploading rather than showing its size", () => {
    render(<PendingFiles files={[file({ status: "uploading" })]} onRemove={jest.fn()} />);
    expect(screen.getByTestId("pending-file-uploading")).toBeTruthy();
    expect(screen.getByText("Uploading…")).toBeTruthy();
  });

  it("collapses past two, so the composer is not pushed off the screen", () => {
    render(<PendingFiles files={many(5)} onRemove={jest.fn()} />);
    expect(screen.getByText("file-0.pdf")).toBeTruthy();
    expect(screen.getByText("file-1.pdf")).toBeTruthy();
    expect(screen.queryByText("file-2.pdf")).toBeNull();
    expect(screen.getByTestId("pending-files-more")).toBeTruthy();
  });

  it("does not collapse when there is nothing to hide", () => {
    render(<PendingFiles files={many(2)} onRemove={jest.fn()} />);
    expect(screen.queryByTestId("pending-files-more")).toBeNull();
  });

  it("opens the rest when asked, and says how many there are", () => {
    render(<PendingFiles files={many(5)} onRemove={jest.fn()} />);
    expect(screen.getByTestId("pending-files-more")).toHaveAccessibleName("Show 3 more files");

    fireEvent.press(screen.getByTestId("pending-files-more"));

    expect(screen.getByText("file-4.pdf")).toBeTruthy();
    expect(screen.queryByTestId("pending-files-more")).toBeNull();
  });

  it("removes the file that was asked for, not the first one", () => {
    const onRemove = jest.fn();
    render(
      <PendingFiles
        files={[file({ key: "a", name: "a.pdf" }), file({ key: "b", name: "b.pdf" })]}
        onRemove={onRemove}
      />,
    );
    fireEvent.press(screen.getByTestId("pending-file-remove-b"));
    expect(onRemove).toHaveBeenCalledWith("b");
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("names the file in the remove control, because there is more than one", () => {
    // Several chips sit side by side and the control is a bare ✕. "Remove"
    // alone tells a screen reader user nothing about WHICH file goes.
    render(<PendingFiles files={[file({ key: "a", name: "lease.pdf" })]} onRemove={jest.fn()} />);
    expect(screen.getByTestId("pending-file-remove-a")).toHaveAccessibleName("Remove lease.pdf");
  });
});
