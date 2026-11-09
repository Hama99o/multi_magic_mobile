/**
 * WHERE FILES COME FROM: the photo library, the Files app, the camera, and
 * (through `app/_layout.tsx`) another app's share sheet.
 * `docs/design/pages/SPEC.md` §3.
 *
 * ── THE PHOTO LIBRARY HANDS OVER THE ORIGINAL ─────────────────────────────
 * iOS's picker, left to its defaults, may TRANSCODE a video into a
 * "compatible" one before returning it: minutes of waiting on a 2 GB 4K
 * clip, and a smaller, worse file in his drive. So:
 *   `preferredAssetRepresentationMode: Current` — the asset as it is stored,
 *     HEVC stays HEVC, HEIC stays HEIC (the server converts for the web);
 *   `videoExportPreset: Passthrough` — no re-encode (`ImagePicker.types.d.ts`);
 *   `shouldDownloadFromNetwork: true` — a clip "optimised" to iCloud is
 *     fetched rather than refused, and Passthrough is the case it covers.
 */
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Alert } from "react-native";
import { create } from "zustand";
import type { IncomingFile } from "@/stores/uploads.store";

export type PickResult = { files: IncomingFile[] } | { denied: true } | { failed: true } | null;

/**
 * What to tell him about a pick, and the files if there are any. A pick that
 * failed or was refused is SAID, never dropped: measured 2026-11-07, a video
 * the system could not read made the photo picker throw and nothing was
 * uploaded or said; and the Pages home ignored a refused permission in silence.
 */
export function explainPick(result: PickResult, t: (key: string) => string): IncomingFile[] | null {
  if (!result) return null;
  if ("failed" in result) {
    Alert.alert(t("pages.add.failedTitle"), t("pages.add.failedBody"));
    return null;
  }
  if ("denied" in result) {
    Alert.alert(t("pages.add.deniedTitle"), t("pages.add.deniedBody"));
    return null;
  }
  return result.files.length ? result.files : null;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/**
 * A name a person can read. Android's system photo picker keeps real names
 * private and answers with the media id: qa_offline_24.jpg came back as
 * "1000017023.jpg" (measured 2026-11-07, QA_DEEP #18), and the camera with
 * a cache UUID ("12cd5e03-….jpeg", #19). Such a name, or none,
 * becomes what a camera would call it, IMG_/VID_ + date and time: the
 * photo's own (EXIF `DateTimeOriginal`, "2026:11:06 19:30:00") when it has
 * one, else the moment it was picked. A real name is kept untouched.
 */
export function friendlyName(name: string | null, mimeType: string | null, taken: string | null, now: Date = new Date()): string {
  // A media id ("1000017023.jpg") or a cache UUID ("12cd5e03-….jpeg", the
  // camera's) is not a name a person gave.
  const hidden = /^(\d{6,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\.[A-Za-z0-9]+)?$/i;
  if (name && !hidden.test(name)) return name;
  const ext = name?.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? EXT[mimeType ?? ""] ?? "bin";
  const exif = taken?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = exif
    ? `${exif[1]}${exif[2]}${exif[3]}_${exif[4]}${exif[5]}${exif[6]}`
    : `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${(mimeType ?? "").startsWith("video/") ? "VID" : "IMG"}_${stamp}.${ext}`;
}

function exifDate(exif: Record<string, unknown> | null | undefined): string | null {
  const value = exif?.DateTimeOriginal ?? exif?.DateTime;
  return typeof value === "string" ? value : null;
}

export async function pickMedia(): Promise<PickResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { denied: true };
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: true,
    selectionLimit: 0,
    quality: 1,
    // Only for the date in a hidden name (`friendlyName`); nothing else reads it.
    exif: true,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
    shouldDownloadFromNetwork: true,
    });
  } catch {
    // A file the system cannot read (a damaged or unusual video) makes the
    // picker throw; say so rather than nothing (`explainPick`).
    return { failed: true };
  }
  if (result.canceled) return null;
  return {
    files: result.assets.map((asset) => {
      const mimeType = asset.mimeType ?? (asset.type === "video" ? "video/quicktime" : "image/jpeg");
      return { uri: asset.uri, name: friendlyName(asset.fileName ?? null, mimeType, exifDate(asset.exif)), mimeType, size: asset.fileSize ?? null };
    }),
  };
}

export async function pickDocuments(): Promise<PickResult> {
  const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: "*/*" });
  if (result.canceled) return null;
  return {
    files: result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? null,
      size: asset.size ?? null,
    })),
  };
}

export async function takePhotoOrVideo(): Promise<PickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { denied: true };
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images", "videos"], quality: 1, exif: false });
  } catch {
    return { failed: true };
  }
  if (result.canceled) return null;
  return {
    files: result.assets.map((asset) => ({
      uri: asset.uri,
      name: friendlyName(asset.fileName ?? null, asset.mimeType ?? null, null),
      mimeType: asset.mimeType ?? null,
      size: asset.fileSize ?? null,
    })),
  };
}

/**
 * Files chosen, place not yet chosen: what `app/pages/save.tsx` reads.
 * In memory on purpose — until he taps "Save here" nothing has been copied,
 * and a share that is abandoned should leave nothing behind.
 */
interface PendingImport {
  files: IncomingFile[];
  /** Called once the files are queued: the share intent's reset. */
  onDone: (() => void) | null;
  set: (files: IncomingFile[], onDone?: () => void) => void;
  clear: () => void;
}

export const usePendingImport = create<PendingImport>((set) => ({
  files: [],
  onDone: null,
  set: (files, onDone) => set({ files, onDone: onDone ?? null }),
  clear: () => set({ files: [], onDone: null }),
}));
