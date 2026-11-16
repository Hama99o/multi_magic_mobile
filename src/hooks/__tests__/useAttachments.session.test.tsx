/**
 * THE FILES ALREADY IN A SESSION ARE CHIPS (audit #32, second half).
 *
 * The web lists every file a session holds above the composer
 * (`AiDocumentChips.tsx`, read from `GET /ai/sessions/:id/documents`), each
 * with an ✕ that deletes it. Mobile drew only what was uploaded in this
 * sitting, so a session reopened later showed no files at all while the
 * assistant kept reading them.
 */
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { documentsApi, type AiDocument } from "@/api/ai";
import { testQueryClient } from "@/__tests__/queryClient";
import { aiKeys } from "@/api/keys";
import { useAttachments } from "../useAttachments";

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

afterEach(() => jest.restoreAllMocks());

const lease: AiDocument = { id: 5, filename: "lease.pdf", contentType: "application/pdf", byteSize: 2048, status: "ready" };
const scan: AiDocument = { id: 6, filename: "scan.png", contentType: "image/png", byteSize: null, status: "pending" };

function setup(initial: { id: number | null; docs: AiDocument[] }) {
  const client = testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(({ id, docs }: { id: number | null; docs: AiDocument[] }) => useAttachments(id, docs), {
    wrapper,
    initialProps: initial,
  });
  return { ...hook, client };
}

it("a reopened session shows the files it already holds", () => {
  const { result } = setup({ id: 878, docs: [lease, scan] });
  expect(result.current.files.map((f) => f.name)).toEqual(["lease.pdf", "scan.png"]);
  expect(result.current.files.every((f) => f.status === "done")).toBe(true);
  expect(result.current.files[0].document?.id).toBe(5);
  expect(result.current.files[0].size).toBe(2048);
});

it("the ✕ on a session file deletes it on the server, then its chip goes", async () => {
  const { result, rerender, client } = setup({ id: 878, docs: [lease, scan] });
  const remove = jest.spyOn(documentsApi, "remove").mockResolvedValue(undefined);
  const invalidate = jest.spyOn(client, "invalidateQueries");
  await act(async () => {
    await result.current.remove(result.current.files[0].key);
  });
  expect(remove).toHaveBeenCalledWith(878, 5);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: aiKeys.documents(878) });
  // Gone at once, before the list is read again…
  expect(result.current.files.map((f) => f.name)).toEqual(["scan.png"]);
  // …and still gone when it is.
  rerender({ id: 878, docs: [scan] });
  expect(result.current.files.map((f) => f.name)).toEqual(["scan.png"]);
});

it("a refused delete keeps the session file and says why", async () => {
  const { result } = setup({ id: 878, docs: [lease] });
  jest.spyOn(documentsApi, "remove").mockRejectedValue({ isAxiosError: true, response: { status: 500, data: {} } });
  await act(async () => {
    await result.current.remove(result.current.files[0].key);
  });
  expect(result.current.error).toBeTruthy();
  expect(result.current.files.map((f) => f.name)).toEqual(["lease.pdf"]);
});

it("a file uploaded here is one chip, not two, once the list has it", async () => {
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///p.jpg", fileName: "p.jpg", mimeType: "image/jpeg", fileSize: 1000 }],
  });
  const uploaded: AiDocument = { id: 41, filename: "p.jpg", contentType: "image/jpeg", byteSize: 1000, status: "pending" };
  jest.spyOn(documentsApi, "upload").mockResolvedValue(uploaded);
  const { result, rerender } = setup({ id: 878, docs: [lease] });
  await act(async () => {
    await result.current.pickImage();
  });
  expect(result.current.files.map((f) => f.name)).toEqual(["lease.pdf", "p.jpg"]);
  rerender({ id: 878, docs: [lease, { ...uploaded, status: "ready" }] });
  await waitFor(() => expect(result.current.files.map((f) => f.name)).toEqual(["lease.pdf", "p.jpg"]));
});

it("another session shows its own files, not the last one's", async () => {
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///p.jpg", fileName: "p.jpg", mimeType: "image/jpeg", fileSize: 1000 }],
  });
  jest.spyOn(documentsApi, "upload").mockRejectedValue(new Error("boom"));
  const { result, rerender } = setup({ id: 878, docs: [lease] });
  await act(async () => {
    await result.current.pickImage();
  });
  expect(result.current.files).toHaveLength(2);
  rerender({ id: 879, docs: [] });
  await waitFor(() => expect(result.current.files).toHaveLength(0));
});
