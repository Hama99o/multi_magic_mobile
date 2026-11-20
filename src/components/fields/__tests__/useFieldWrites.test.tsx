/**
 * `FieldTarget.send` (agreed with Flow's session, 2026-11-20): without it the
 * shared editors write through the core endpoints (Flow); with it, the app's
 * own function runs and core is never called (Tables, whose rows need
 * `TableApp::RecordWriter`, `row.updated` history and the cardinality answer).
 */
import MockAdapter from "axios-mock-adapter";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { http } from "@/api/http";
import type { FieldDefinition, Selection } from "@/api/fields";
import { testQueryClient } from "@/__tests__/queryClient";
import { useFieldWrites, type FieldTarget } from "../useFieldWrites";

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
});
afterEach(() => mock.restore());

const field = { id: 3, name: "Supplier", key: "f3", fieldType: "multi_record", recordClass: "TableApp::Record", tagCategoryId: null, position: 3, required: false, config: { options: [], min: null, max: null, allowCreate: false, scope: null, raw: {} }, ownerType: "TableApp::Table", ownerId: 10 } as FieldDefinition;
const text = { ...field, id: 1, name: "Name", fieldType: "text", recordClass: null } as FieldDefinition;

function hook(target: FieldTarget) {
  const client = testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useFieldWrites(target), { wrapper });
}

const base = { record: { type: "TableApp::Record", id: 501 }, touched: [["tables", "rows", 10]], edit: () => undefined };

it("without `send`, a value goes to core's batch update (Flow's path)", async () => {
  mock.onPatch("/api/v1/core/field_values/batch_update").reply(200, { field_values: {} });
  const { result } = hook(base);
  await act(async () => {
    result.current.setScalar.mutate({ field: text, value: "Blue scarf" });
  });
  await waitFor(() => expect(mock.history.patch.map((r) => r.url)).toEqual(["/api/v1/core/field_values/batch_update"]));
});

it("with `send`, the app's own functions run and core is never called", async () => {
  const made: Selection = { selectionId: 2, recordId: 901, recordType: "TableApp::Record" };
  const send = {
    setValues: jest.fn(async () => undefined),
    link: jest.fn(async () => made),
    unlink: jest.fn(async () => undefined),
  };
  const { result } = hook({ ...base, send });
  await act(async () => {
    result.current.setScalar.mutate({ field: text, value: "Blue scarf" });
    result.current.link.mutate({ field, recordId: 901 });
    result.current.unlink.mutate({ field, selection: made });
  });
  await waitFor(() => expect(send.unlink).toHaveBeenCalledWith(field, made));
  expect(send.setValues).toHaveBeenCalledWith({ 1: "Blue scarf" });
  expect(send.link).toHaveBeenCalledWith(field, 901);
  expect(mock.history.patch).toHaveLength(0);
  expect(mock.history.post).toHaveLength(0);
  expect(mock.history.delete).toHaveLength(0);
});
