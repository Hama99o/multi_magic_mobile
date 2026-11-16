/**
 * THE ✕ ON A FILE CHIP REMOVES THE FILE (audit P1 #32, 2026-11-16).
 *
 * It only hid the chip: the file stayed in the session, so the assistant kept
 * reading a document the person had taken away. Now an uploaded file is
 * deleted on the server (`DELETE /ai/sessions/:id/documents/:doc`, as the
 * web's chips do), and a refusal keeps the chip and says why.
 */
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { documentsApi } from "@/api/ai";
import { testQueryClient } from "@/__tests__/queryClient";
import { useAttachments } from "../useAttachments";

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

afterEach(() => jest.restoreAllMocks());

async function uploadedOne() {
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///p.jpg", fileName: "p.jpg", mimeType: "image/jpeg", fileSize: 1000 }],
  });
  jest
    .spyOn(documentsApi, "upload")
    .mockResolvedValue({ id: 41, filename: "p.jpg", status: "ready" } as Awaited<ReturnType<typeof documentsApi.upload>>);
  const client = testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useAttachments(878, []), { wrapper });
  await act(async () => {
    await hook.result.current.pickImage();
  });
  return { ...hook, client };
}

it("an uploaded file is deleted from the session, then its chip goes", async () => {
  const { result, client } = await uploadedOne();
  const remove = jest.spyOn(documentsApi, "remove").mockResolvedValue(undefined);
  const invalidate = jest.spyOn(client, "invalidateQueries");
  await act(async () => {
    result.current.remove(result.current.pending[0].key);
  });
  await waitFor(() => expect(result.current.pending).toHaveLength(0));
  expect(remove).toHaveBeenCalledWith(878, 41);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["ai", "documents", 878] });
});

it("a refused delete keeps the chip and says why", async () => {
  const { result } = await uploadedOne();
  jest.spyOn(documentsApi, "remove").mockRejectedValue({ isAxiosError: true, response: { status: 500, data: {} } });
  await act(async () => {
    result.current.remove(result.current.pending[0].key);
  });
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.pending).toHaveLength(1);
});

it("a failed upload is only taken off the screen: there is nothing on the server", async () => {
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///p.jpg", fileName: "p.jpg", mimeType: "image/jpeg", fileSize: 1000 }],
  });
  jest.spyOn(documentsApi, "upload").mockRejectedValue(new Error("boom"));
  const remove = jest.spyOn(documentsApi, "remove");
  const client = testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useAttachments(878, []), { wrapper });
  await act(async () => {
    await result.current.pickImage();
  });
  expect(result.current.pending[0]?.status).toBe("failed");
  await act(async () => {
    result.current.remove(result.current.pending[0].key);
  });
  expect(result.current.pending).toHaveLength(0);
  expect(remove).not.toHaveBeenCalled();
});
