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
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  ALLOWED_UPLOAD_EXTENSIONS, ALLOWED_UPLOAD_MIME_TYPES, LIMITS, documentsApi,
  type AiDocument,
} from "@/api/ai";
import { failureMessage } from "@/api/failure";
import i18n, { t } from "@/i18n";
import { aiKeys } from "@/api/keys";

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

/**
 * A size in the reader's language: "3.0 MB" in English, "3,0 Mo" in French.
 * It was English in both until 2026-09-24, so the French "too big" refusal
 * read "fait 12.0 MB … moins de 10 Mo", two units in one sentence. The
 * number follows the app's language, not the phone's region (the rule, and
 * why, is in `DayDivider.tsx`).
 */
export function describeSize(bytes: number): string {
  const n = (value: number, digits: number) =>
    value.toLocaleString(i18n.language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (bytes < 1024) return t("files.sizeBytes", { n: n(bytes, 0) });
  if (bytes < 1024 * 1024) return t("files.sizeKb", { n: n(Math.round(bytes / 1024), 0) });
  return t("files.sizeMb", { n: n(bytes / (1024 * 1024), 1) });
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
    return t("files.tooMany", { max: LIMITS.maxFilesPerSession });
  }
  if (file.size > LIMITS.maxFileBytes) {
    return t("files.tooBig", {
      name: file.name,
      size: describeSize(file.size),
      max: LIMITS.maxFileBytes / (1024 * 1024),
    });
  }
  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(extensionOf(file.name) as never)) {
    return t("files.wrongType", { name: file.name });
  }
  return null;
}

/** A key for a file the SESSION holds, by its server id. */
const sessionKey = (documentId: number) => `doc-${documentId}`;

/**
 * `uploaded` is what the session holds on the server
 * (`GET /ai/sessions/:id/documents`, the documents query in `app/chat.tsx`).
 */
export function useAttachments(conversationId: number | null, uploaded: readonly AiDocument[] = []) {
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Removed on the server, until the documents query reads the list again.
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const queryClient = useQueryClient();
  const uploadedCount = uploaded.length;

  // What was picked in one session is that session's: another one opens
  // with its own files, not the last one's chips (React's "adjust state when
  // a prop changes", no effect).
  const [pendingFor, setPendingFor] = useState(conversationId);
  if (pendingFor !== conversationId) {
    setPendingFor(conversationId);
    setPending([]);
    setRemovedIds([]);
    setError(null);
  }

  /**
   * EVERY CHIP: the files the session already holds, then this sitting's
   * uploads the list has not caught up with (audit #32, second half; the
   * web's `AiDocumentChips`). A session reopened later used to show no files
   * while the assistant kept reading them. One file is one chip: once the
   * list has an upload, the list's copy is drawn.
   */
  const files = useMemo(() => {
    const removed = new Set(removedIds);
    const held = uploaded.filter((d) => !removed.has(d.id));
    const heldIds = new Set(held.map((d) => d.id));
    const fromSession: PendingFile[] = held.map((document) => {
      const local = pending.find((p) => p.document?.id === document.id);
      return {
        key: local?.key ?? sessionKey(document.id),
        name: document.filename,
        uri: local?.uri ?? "",
        mimeType: document.contentType ?? local?.mimeType ?? "application/octet-stream",
        size: document.byteSize ?? local?.size ?? 0,
        status: "done",
        document,
      };
    });
    const notListed = pending.filter((p) => !(p.document && (heldIds.has(p.document.id) || removed.has(p.document.id))));
    return [...fromSession, ...notListed];
  }, [uploaded, pending, removedIds]);
  // The upload is a mutation (docs/DATA_LAYER.md); the chip's own state
  // (uploading / done / failed) stays local, because a file that vanishes
  // looks like one that uploaded.
  const uploading = useMutation({
    mutationFn: ({ conversationId: id, file }: { conversationId: number; file: Parameters<typeof documentsApi.upload>[1] }) => documentsApi.upload(id, file),
  });

  const upload = useCallback(
    async (file: { name: string; uri: string; mimeType: string; size: number }) => {
      if (conversationId == null) return;

      // Uploads the list does not hold yet, on top of what it does.
      const inFlight = pending.filter((p) => p.status !== "failed" && !(p.document && uploaded.some((d) => d.id === p.document?.id))).length;
      const refusal = rejectionFor(file, uploadedCount + inFlight);
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
        const document = await uploading.mutateAsync({ conversationId, file });
        setPending((current) =>
          current.map((p) => (p.key === key ? { ...p, status: "done", document } : p)),
        );
        // The chip's "Reading…" ends when the documents query (app/chat.tsx)
        // sees this file ready, and that query polls only while IT holds a
        // pending file. Without this refetch it never held the new one, so it
        // never polled: seen 2026-11-10, "Reading…" for minutes on a photo
        // the server had read in 5 s.
        void queryClient.invalidateQueries({ queryKey: aiKeys.documents(conversationId) });
      } catch (e) {
        // Kept on screen as FAILED rather than removed: a file that vanishes
        // looks like one that uploaded.
        setPending((current) =>
          current.map((p) =>
            p.key === key
              ? { ...p, status: "failed", error: failureMessage(e, t("files.uploadFailed")) }
              : p,
          ),
        );
      }
    },
    [conversationId, uploadedCount, uploaded, pending, queryClient, uploading],
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
      setError(t("files.needPhotoPermission"));
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
      setError(t("files.needCameraPermission"));
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

  const deleting = useMutation({
    mutationFn: ({ conversationId: id, documentId }: { conversationId: number; documentId: number }) => documentsApi.remove(id, documentId),
  });

  /**
   * The ✕ on a chip. An UPLOADED file is deleted from the session on the
   * server, as the web's chips do (audit P1 #32): hiding the chip alone left
   * the assistant reading a file the person had taken away. The chip goes
   * once the server agrees; a refusal keeps it and says why. A file that never
   * reached the server (uploading, failed) is only taken off the screen.
   */
  const remove = useCallback(
    async (key: string) => {
      const file = files.find((p) => p.key === key);
      const documentId = file?.document?.id;
      if (file?.status !== "done" || documentId == null || conversationId == null) {
        setPending((current) => current.filter((p) => p.key !== key));
        return;
      }
      setError(null);
      try {
        await deleting.mutateAsync({ conversationId, documentId });
        setPending((current) => current.filter((p) => p.key !== key));
        setRemovedIds((current) => [...current, documentId]);
        void queryClient.invalidateQueries({ queryKey: aiKeys.documents(conversationId) });
      } catch (e) {
        setError(failureMessage(e, t("files.removeFailed")));
      }
    },
    [files, conversationId, deleting, queryClient],
  );

  return { files, pending, error, setError, pickDocument, pickImage, takePhoto, remove };
}
