/**
 * AN UPLOADED FILE STOPS SAYING "Reading…" ONCE THE SERVER HAS READ IT.
 *
 * Seen 2026-11-10 on the emulator: a photo attached in the assistant said
 * "Reading…" for minutes, while the server had read it in 5 s
 * (`Ai::IndexDocumentJob` done, `ai_documents.status` ready). The chip's word
 * is the documents query (`["ai", "documents", id]`, `app/chat.tsx`), which
 * polls only while IT holds a pending document — and nothing refetched it
 * after an upload, so it never held the new one, never polled, and the chip
 * kept the "pending" the upload itself returned.
 */
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
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

it("a finished upload refreshes this conversation's documents, so their poll can start", async () => {
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///p.jpg", fileName: "p.jpg", mimeType: "image/jpeg", fileSize: 1000 }],
  });
  jest
    .spyOn(documentsApi, "upload")
    .mockResolvedValue({ id: 41, filename: "p.jpg", status: "pending" } as Awaited<ReturnType<typeof documentsApi.upload>>);
  const client = testQueryClient();
  const invalidate = jest.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

  const { result } = renderHook(() => useAttachments(878, 0), { wrapper });
  await act(async () => {
    await result.current.pickImage();
  });

  expect(result.current.pending[0]?.status).toBe("done");
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["ai", "documents", 878] });
});
