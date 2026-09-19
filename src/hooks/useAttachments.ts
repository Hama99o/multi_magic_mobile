/**
 * Files dropped into a conversation.
 *
 * ── THE ALLOWED LIST IS THE MODEL'S, NOT THE EXTRACTOR'S ──────────────────
 * `AiDocument::ALLOWED_EXTENSIONS` is nine types and it is what the endpoint
 * enforces. `Ai::FileExtractor` is the PERMISSIVE end — it also reads .docx and
 * .xlsx — so offering what the extractor can read produces a file that the
 * picker accepted and the server then 422s. The two lists disagree on purpose.
 *
 * Every limit is checked HERE, before the request, so a person meets our
 * sentence rather than the server's: 10 MB a file, 20 files a conversation.
 *
 * A pending file is one the assistant has NOT been told about yet. It stays
 * visibly pending until the upload completes, because a file that looks sent
 * and is not is the worst state available — the user asks a question about a
 * document the model cannot see.
 */
import { useCallback, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  ALLOWED_UPLOAD_EXTENSIONS, ALLOWED_UPLOAD_MIME_TYPES, LIMITS, documentsApi,
  type AiDocument,
} from "@/api/ai";
import { failureMessage } from "@/api/failure";

export interface PendingFile {
  /** Local, and only for React's key — the server's id arrives on success. */
  key: string;
  name: string;
  uri: string;
  mimeType: string;
  size: number;
  status: "uploading" | "done" | "failed";
  error?: string;
  document?: AiDocument;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function describeSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The refusal sentence, or null.
 *
 * Extension rather than MIME type is the authority, exactly as the server does
 * it: `AiDocument.acceptable?` falls back to the extension because a .csv from
 * Excel arrives as `application/vnd.ms-excel` and a file from some pickers
 * arrives as `application/octet-stream`.
 */
export function rejectionFor(
  file: { name: string; size: number },
  existingCount: number,
): string | null {
  if (existingCount >= LIMITS.maxFilesPerSession) {
    return `This conversation already has ${LIMITS.maxFilesPerSession} files, which is the most it can hold.`;
  }
  if (file.size > LIMITS.maxFileBytes) {
    return `${file.name} is ${describeSize(file.size)}. Files have to be under ${LIMITS.maxFileBytes / (1024 * 1024)} MB.`;
  }
  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(extensionOf(file.name) as never)) {
    return `MultiMagic can read PDFs, images and CSVs. ${file.name} is not one of those.`;
  }
  return null;
}

export function useAttachments(conversationId: number | null, uploadedCount: number) {
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: { name: string; uri: string; mimeType: string; size: number }) => {
      if (conversationId == null) return;

      const refusal = rejectionFor(file, uploadedCount + pending.filter((p) => p.status !== "failed").length);
      if (refusal) {
        setError(refusal);
        return;
      }

      setError(null);
      const key = `${file.name}-${Date.now()}`;
      setPending((current) => [
        ...current,
        { key, name: file.name, uri: file.uri, mimeType: file.mimeType, size: file.size, status: "uploading" },
      ]);

      try {
        const document = await documentsApi.upload(conversationId, file);
        setPending((current) =>
          current.map((p) => (p.key === key ? { ...p, status: "done", document } : p)),
        );
      } catch (e) {
        // Kept on screen as FAILED rather than removed: a file that vanishes
        // looks like one that uploaded.
        setPending((current) =>
          current.map((p) =>
            p.key === key
              ? { ...p, status: "failed", error: failureMessage(e, "That file did not upload.") }
              : p,
          ),
        );
      }
    },
    [conversationId, uploadedCount, pending],
  );

  const pickDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      // The endpoint's list, not the extractor's.
      type: [...ALLOWED_UPLOAD_MIME_TYPES],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await upload({
      name: asset.name,
      uri: asset.uri,
      mimeType: asset.mimeType ?? "application/octet-stream",
      size: asset.size ?? 0,
    });
  }, [upload]);

  const pickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("MultiMagic needs permission to open your photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await upload({
      name: asset.fileName ?? `photo-${Date.now()}.jpg`,
      uri: asset.uri,
      mimeType: asset.mimeType ?? "image/jpeg",
      size: asset.fileSize ?? 0,
    });
  }, [upload]);

  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("MultiMagic needs permission to use the camera.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await upload({
      name: asset.fileName ?? `photo-${Date.now()}.jpg`,
      uri: asset.uri,
      mimeType: asset.mimeType ?? "image/jpeg",
      size: asset.fileSize ?? 0,
    });
  }, [upload]);

  const remove = useCallback((key: string) => {
    setPending((current) => current.filter((p) => p.key !== key));
  }, []);

  return { pending, error, setError, pickDocument, pickImage, takePhoto, remove };
}
