/**
 * useFieldWrites: link and unlink a record field (review FL4, 88, 2026-11-21).
 *
 * A link's guess carries `selectionId: -recordId` until the server answers.
 * Unlinking it before then sent DELETE /…/-3 (a 404), and when the link did
 * land, its answer mapped over rows the unlink had removed: the server kept a
 * link the screen no longer showed. An unlink of a pending link waits for it,
 * then deletes the REAL selection.
 */
import { act, renderHook } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { testQueryClient } from "@/__tests__/queryClient";
import { fieldsApi, type FieldDefinition, type FieldValues, type Selection } from "@/api/fields";
import { useFieldWrites, type FieldTarget } from "../useFieldWrites";

const field = { id: 5, name: "People", key: "people", fieldType: "multi_record", recordClass: "Contact" } as unknown as FieldDefinition;
const KEY = ["record", 1];

function setup() {
  const client = testQueryClient();
  client.setQueryData<FieldValues>(KEY, {});
  const target: FieldTarget = {
    record: { type: "FlowApp::Card", id: 1 },
    touched: [KEY],
    edit: (c: QueryClient, change) => c.setQueryData<FieldValues>(KEY, (v) => change(v ?? {})),
  };
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useFieldWrites(target), { wrapper });
  return { client, hook };
}

afterEach(() => jest.restoreAllMocks());

it("unlinking a link the server has not answered yet deletes the real selection, never -recordId", async () => {
  let answer!: (s: Selection) => void;
  jest.spyOn(fieldsApi, "addSelection").mockImplementation(() => new Promise<Selection>((r) => (answer = r)));
  const remove = jest.spyOn(fieldsApi, "removeSelection").mockResolvedValue();
  const { hook } = setup();

  await act(async () => {
    hook.result.current.link.mutate({ field, recordId: 3 });
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    hook.result.current.unlink.mutate({ field, selection: { selectionId: -3, recordId: 3, recordType: "Contact" } });
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    answer({ selectionId: 77, recordId: 3, recordType: "Contact" });
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  expect(remove.mock.calls.map((c) => c[0])).toEqual([77]);
});

it("unlinking a pending link whose create then FAILS deletes nothing", async () => {
  let refuse!: (e: unknown) => void;
  jest.spyOn(fieldsApi, "addSelection").mockImplementation(() => new Promise<Selection>((_r, j) => (refuse = j)));
  const remove = jest.spyOn(fieldsApi, "removeSelection").mockResolvedValue();
  const { hook } = setup();

  await act(async () => {
    hook.result.current.link.mutate({ field, recordId: 3 });
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    hook.result.current.unlink.mutate({ field, selection: { selectionId: -3, recordId: 3, recordType: "Contact" } });
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    refuse(new Error("422"));
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  expect(remove).not.toHaveBeenCalled();
});
