/**
 * CLOSING THE TRANSFER SHEET DOES NOT STOP THE LISTS CATCHING UP (review 88, P7, 2026-11-21).
 *
 * The sheet polls its transfer and, when an import or a copy is done, refreshes every Pages
 * list. Closing it (as people do: an import takes a while) set `started` to null, which stopped
 * the polling, so the lists never learned the import had finished until a pull to refresh.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { useState } from "react";
import { testQueryClient } from "@/__tests__/queryClient";
import { http } from "@/api/http";
import { pagesKeys } from "@/api/keys";
import type { Transfer } from "@/api/transfers";
import { TransferSheet } from "../TransferSheet";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const importing: Transfer = { id: 41, kind: "import", state: "processing", progress: 30, message: "Reading the ZIP", error: null, resultSpaceId: 9, resultNodeId: null, artifactUrl: null, artifactFilename: null };
const wire = (t: Transfer) => ({ transfer: { id: t.id, kind: t.kind, state: t.state, progress: t.progress, message: t.message, error: t.error, result_space_id: t.resultSpaceId, result_node_id: t.resultNodeId, artifact_url: t.artifactUrl, artifact_filename: t.artifactFilename } });

let mock: MockAdapter;
beforeEach(() => (mock = new MockAdapter(http)));
afterEach(() => mock.restore());

function Parent() {
  const [started, setStarted] = useState<Transfer | null>(importing);
  return <TransferSheet started={started} onClose={() => setStarted(null)} />;
}

it("an import still running when the sheet is closed still refreshes the lists when it is done", async () => {
  let finished = false;
  mock.onGet("/api/v1/page_app/transfers/41").reply(() => [200, wire(finished ? { ...importing, state: "done", progress: 100 } : importing)]);
  const client = testQueryClient();
  const invalidate = jest.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <Parent />
    </QueryClientProvider>,
  );
  await screen.findByText("Reading the ZIP");
  fireEvent.press(screen.getByLabelText("Close"));
  await waitFor(() => expect(screen.queryByTestId("pages-transfer-sheet")).toBeNull());
  finished = true;
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: pagesKeys.all }), { timeout: 6000 });
});
