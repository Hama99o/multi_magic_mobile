/**
 * The confirm that names what is NOT destroyed.
 *
 * This is the guarantee he asked for in his own words — *"deleting session did
 * not delete data of apps like loan, contact etc."* — and the moment of
 * deleting is when somebody wants to read it. So the sentence is tested, not
 * just written.
 */
import { render, screen } from "@testing-library/react-native";
import { DeleteConfirm, deleteQuestion, safeSentence } from "../DeleteConfirm";

describe("the question", () => {
  // "and the 0 files in it" is the kind of sentence that tells a user nobody
  // looked — and somebody who notices that stops trusting the sentence
  // underneath it, which is the one that matters.
  it("does not mention files when there are none", () => {
    expect(deleteQuestion(0)).toBe("Delete this conversation?");
    expect(deleteQuestion(0)).not.toMatch(/0 files/);
  });

  it("counts files when there are some, and gets the singular right", () => {
    expect(deleteQuestion(1)).toBe("Delete this conversation and the 1 file in it?");
    expect(deleteQuestion(3)).toBe("Delete this conversation and the 3 files in it?");
  });
});

describe("the guarantee", () => {
  it.each([0, 1, 5])("is present with %i files", (fileCount) => {
    render(
      <DeleteConfirm visible fileCount={fileCount} onCancel={jest.fn()} onConfirm={jest.fn()} />,
    );

    // In BOTH strings. It is not conditional on there being files, because it
    // is not about the files.
    expect(screen.getByTestId("delete-conversation-safe")).toHaveTextContent(safeSentence());
  });

  it("names the four things by name rather than saying 'your data'", () => {
    expect(safeSentence()).toMatch(/notes/);
    expect(safeSentence()).toMatch(/contacts/);
    expect(safeSentence()).toMatch(/loans/);
    expect(safeSentence()).toMatch(/money/);
  });
});

describe("the dialog", () => {
  it("renders nothing when it is not visible", () => {
    render(
      <DeleteConfirm visible={false} fileCount={2} onCancel={jest.fn()} onConfirm={jest.fn()} />,
    );

    expect(screen.queryByTestId("delete-conversation-confirm")).toBeNull();
  });

  it("offers keeping it as well as deleting", () => {
    render(<DeleteConfirm visible fileCount={2} onCancel={jest.fn()} onConfirm={jest.fn()} />);

    expect(screen.getByTestId("delete-conversation-yes")).toBeTruthy();
    expect(screen.getByTestId("delete-conversation-cancel")).toBeTruthy();
  });
});
