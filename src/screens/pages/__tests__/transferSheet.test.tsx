/**
 * The transfer sheet (parity #12, #25, #28, #33, #34): what it says while
 * the server works, when it is done, and when it failed; Cancel reaches the
 * server. Invented values only.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { testQueryClient } from "@/__tests__/queryClient";
import { http } from "@/api/http";
import type { Transfer } from "@/api/transfers";
import { TransferSheet } from "../TransferSheet";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const base: Transfer = { id: 41, kind: "export", state: "processing", progress: 40, message: "Zipping 12 files", error: null, resultSpaceId: null, resultNodeId: null, artifactUrl: null, artifactFilename: null };
const wire = (t: Transfer) => ({ transfer: { id: t.id, kind: t.kind, state: t.state, progress: t.progress, message: t.message, error: t.error, result_space_id: t.resultSpaceId, result_node_id: t.resultNodeId, artifact_url: t.artifactUrl, artifact_filename: t.artifactFilename } });

let mock: MockAdapter;
beforeEach(() => (mock = new MockAdapter(http)));
afterEach(() => mock.restore());

function show(t: Transfer, onClose = jest.fn()) {
  mock.onGet("/api/v1/page_app/transfers/41").reply(200, wire(t));
  render(
    <QueryClientProvider client={testQueryClient()}>
      <TransferSheet started={t} onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

it("while it works: the server's own message, the progress, and a Cancel that reaches the server", async () => {
  mock.onDelete("/api/v1/page_app/transfers/41").reply(204);
  const onClose = show(base);
  expect(await screen.findByText("Zipping 12 files")).toBeTruthy();
  expect(screen.getByText("40%")).toBeTruthy();
  fireEvent.press(screen.getByTestId("pages-transfer-cancel"));
  await waitFor(() => expect(mock.history.delete).toHaveLength(1));
  expect(onClose).toHaveBeenCalled();
});

it("an export that is done offers the ZIP, by name, to share or save", async () => {
  show({ ...base, state: "done", progress: 100, message: null, artifactUrl: "https://files.example.test/Family.zip", artifactFilename: "Family.zip" });
  expect(await screen.findByText("Family.zip is ready.")).toBeTruthy();
  expect(screen.getByTestId("pages-transfer-share")).toBeTruthy();
  expect(screen.getByTestId("pages-transfer-save")).toBeTruthy();
  expect(screen.queryByTestId("pages-transfer-cancel")).toBeNull();
});

it("an import that is done opens what it made; a failure says the server's reason", async () => {
  show({ ...base, kind: "import", state: "done", progress: 100, resultSpaceId: 7 });
  expect(await screen.findByTestId("pages-transfer-open")).toBeTruthy();
});

it("a failure says the server's reason and offers no Cancel", async () => {
  show({ ...base, state: "failed", error: "The ZIP is over your storage limit." });
  expect(await screen.findByText("The ZIP is over your storage limit.")).toBeTruthy();
  expect(screen.queryByTestId("pages-transfer-cancel")).toBeNull();
});
