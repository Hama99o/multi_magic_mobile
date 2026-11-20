/**
 * A finished export's ZIP, onto the phone: fetched into the cache under its
 * own name, then shared (the system sheet: Mail, Drive, "Save to Files") or
 * copied into a folder picked once (Android's document tree, iOS Files).
 * The copy is chunked into a file the folder made, as `downloadMany` does
 * and for the same reason (SAF refuses `copy` onto a file it just created).
 */
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, FileMode, Paths } from "expo-file-system";
import { isPickerCancel } from "./downloadMany";
import { safeFileName } from "@/api/pages";

export async function fetchArtifact(url: string, filename: string, transferId: number): Promise<File> {
  const dir = new Directory(Paths.cache, "pages-transfers", String(transferId));
  dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, safeFileName(filename || "export.zip"));
  if (target.exists) return target;
  return File.downloadFileAsync(url, target, { idempotent: true });
}

export async function shareArtifact(file: File): Promise<"shared" | "unavailable"> {
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  await Sharing.shareAsync(file.uri, { mimeType: "application/zip", UTI: "public.zip-archive", dialogTitle: file.name });
  return "shared";
}

/** Null when the folder picker was cancelled. */
export async function saveArtifact(file: File): Promise<"saved" | null> {
  let dirUri: string;
  try {
    dirUri = (await Directory.pickDirectoryAsync()).uri;
  } catch (error) {
    if (isPickerCancel(error)) return null;
    throw error;
  }
  const target = new Directory(dirUri).createFile(file.name, "application/zip");
  try {
    const from = file.open(FileMode.ReadOnly);
    const to = target.open(FileMode.WriteOnly);
    try {
      for (;;) {
        const chunk = from.readBytes(1024 * 1024);
        if (chunk.length === 0) break;
        to.writeBytes(chunk);
      }
    } finally {
      from.close();
      to.close();
    }
  } catch (error) {
    try {
      target.delete();
    } catch {
      /* the original error is the one to report */
    }
    throw error;
  }
  return "saved";
}

/** A .zip from Files, or null when nothing (or something else) was picked. */
export async function pickZip(): Promise<{ uri: string; name: string; mimeType: string | null } | "not-zip" | null> {
  const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true, type: ["application/zip", "application/x-zip-compressed", "application/octet-stream"] });
  if (result.canceled || !result.assets[0]) return null;
  const a = result.assets[0];
  if (!/\.zip$/i.test(a.name) && !/zip/i.test(a.mimeType ?? "")) return "not-zip";
  return { uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/zip" };
}
