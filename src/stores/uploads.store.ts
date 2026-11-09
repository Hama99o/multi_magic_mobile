/**
 * THE UPLOAD QUEUE — files going from this phone into Pages.
 * `docs/design/pages/SPEC.md` §3.
 *
 * The owner's real use: vlog clips and photos from his iPhone, 200 MB to
 * 2 GB each, several at a time, into a space and a date folder, then fetched
 * from the laptop. So the queue has three jobs, and each one has a cause:
 *
 * ── 1. IT SURVIVES THE APP BEING CLOSED ───────────────────────────────────
 * Every item is written to AsyncStorage (`KEY`) whenever its STATUS changes,
 * and its file is MOVED into `Documents/pages-uploads/<id>/` first: a picked
 * video lives in a cache directory the OS may empty, and a queue that points
 * at a file that has gone is a queue of failures.
 *
 * ── 2. THE BYTES TRAVEL OUTSIDE JS ─────────────────────────────────────────
 * `expo-file-system`'s `UploadTask` streams the file from disk in native
 * code; a 2 GB clip never becomes a JS string. On iOS its session is
 * `background` (`NetworkTasks.types.d.ts`, `sessionType`), so the transfer
 * carries on when the phone is locked or the app is swiped away. Android has
 * no such session in this module: the upload runs while the process lives,
 * and a killed process re-queues the file on the next launch (§3 below).
 *
 * ── 3. A RELAUNCH CHECKS BEFORE IT RETRIES ────────────────────────────────
 * iOS may finish a background upload while no JS is running, so an item
 * found "uploading" on launch may already be on the server. Re-sending it
 * blindly would put two copies of a 2 GB clip in his folder. `reconcile`
 * asks the destination folder first: a node with the same title and the same
 * byte size, created after the item was queued, means it arrived.
 *
 * The server has no resumable upload (`multi_magic`
 * `docs/design/PAGES_UX_2026.md` §10), so a retry starts the file from zero.
 * Uploads go through the app (`ActiveStorage` on `Disk`), 2 GB a file
 * (`PageApp::Node::MAX_ATTACHMENT_SIZE`), weighed against the storage quota
 * (`StorageQuotaEnforcement`), which answers 422 `storage_quota_exceeded`.
 */
import { create } from "zustand";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths, UploadTask, UploadType } from "expo-file-system";
import { API_URL } from "@/config/env";
import { authHeaders, http } from "@/api/http";
import { pagesApi, safeFileName } from "@/api/pages";
import { queryClient } from "@/lib/queryClient";
import { IN_EXPO_GO } from "@/config/runtime";
import { useReachability } from "@/stores/reachability.store";

const KEY = "mm-pages-uploads";
/**
 * ONE AT A TIME. It was two, and on his iPhone over 2-bar 5G (2026-11-07) both
 * kept failing: a whole-file upload restarts from zero when the link drops,
 * and two at once split a weak uplink, so each took twice as long and was
 * twice as likely to be cut. One at a time gets each clip through in half the
 * time. Revisit once uploads are chunked and resumable (a dropped chunk then
 * costs one chunk, not the clip).
 */
export const MAX_PARALLEL = 1;
/**
 * A DROPPED CONNECTION IS NOT A FAILURE (measured 2026-11-06, `qa_phone`):
 * the first version gave up after 3 tries 3 and 6 s apart, so 25 s of
 * airplane mode left every clip "failed" and nothing resumed when the
 * network came back, each row waiting for a tap. A tunnel, a lift, a weak
 * signal would do the same to his vlog clips. Now a network error waits and
 * tries again, the delay doubling from 2 s to a 30 s ceiling, for about
 * 20 minutes (`AUTO_RETRIES`), and AT ONCE when the app comes back to the
 * front or the API answers again. Only the server refusing the file (quota,
 * too large, signed out) is a failure.
 */
export const AUTO_RETRIES = 40;
export const RETRY_CEILING_MS = 30_000;
export function retryDelay(attempts: number): number {
  return Math.min(RETRY_CEILING_MS, 2_000 * 2 ** Math.max(0, attempts - 1));
}
/** `PageApp::Node::MAX_ATTACHMENT_SIZE`, refused here before a byte is sent. */
export const MAX_FILE_BYTES = 2 * 1024 ** 3;

/** `preparing`: the row exists, its file is still being copied into the app
 *  (QA_FULL U4: ~5 s of nothing on screen after picking a 107 MB clip). */
export type UploadStatus = "preparing" | "queued" | "uploading" | "checking" | "done" | "failed";
export type UploadError = "network" | "quota" | "tooLarge" | "signedOut" | "server" | "missingFile";

export interface Destination {
  spaceId: number;
  parentId: number | null;
  /** "Vloging / 2026-11-06", for the tray. */
  label: string;
}

export interface UploadItem {
  id: string;
  /** Our own copy, under `Documents/pages-uploads/<id>/`. */
  localUri: string;
  fileName: string;
  mimeType: string;
  size: number;
  destination: Destination;
  status: UploadStatus;
  /** Bytes sent; in memory only, never persisted (it changes 10× a second). */
  sent: number;
  error: UploadError | null;
  attempts: number;
  queuedAt: string;
  /** Not before this instant (ms): the backoff after a dropped connection.
   *  Without it, any other upload finishing would retry an offline file
   *  immediately, in a tight loop. */
  retryAt?: number;
  /** The resumable session (`POST /page_app/uploads`), once opened. */
  uploadId?: string;
  /** Bytes the server has CONFIRMED: where a drop, a kill or a relaunch resumes. */
  offset?: number;
  /** The server has no resumable endpoint (not deployed yet): one request. */
  legacy?: boolean;
}

export interface IncomingFile {
  uri: string;
  name: string | null;
  mimeType: string | null;
  size: number | null;
}

interface UploadsState {
  items: UploadItem[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  enqueue: (files: IncomingFile[], destination: Destination) => Promise<number>;
  retry: (id: string) => void;
  cancel: (id: string) => void;
  clearFinished: () => void;
}

const running = new Map<string, UploadTask>();

/** Cancels a transfer that may still be alive in the system; never throws. */
function stopTransfer(task: UploadTask): void {
  try {
    task.cancel();
  } catch {
    // Already finished or released: nothing left to stop.
  }
}

/**
 * RESUMABLE, PIECE BY PIECE. One whole-file request restarted from zero on
 * every drop, and on his iPhone over 2-bar 5G (2026-11-07) a 543 MB clip never
 * finished. Pieces of 8 MB, each confirmed by the server, so a drop costs one
 * piece: the server side is `PageApp::ResumableUpload` (multi_magic). A piece
 * is cut from the file through a handle (a 2 GB clip is never in memory) into
 * a small file, and sent by the same native `UploadTask` as before.
 */
export const CHUNK_BYTES = 8 * 1000 * 1000;
const SESSIONS = "/api/v1/page_app/uploads";

function httpStatus(error: unknown): number | null {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return typeof status === "number" ? status : null;
}

/**
 * Is this file already in its folder? Same name, same size, created after it
 * was queued. A failed look answers "no", which can only mean one more send,
 * never a lost file.
 */
async function arrivedOnServer(item: UploadItem): Promise<boolean> {
  try {
    const page = await pagesApi.children(item.destination.spaceId, item.destination.parentId, 1, {
      sortBy: "created_at",
      sortDir: "desc",
    });
    // Compared as instants: the server writes `+01:00`, this phone wrote
    // `Z`, and as strings those do not order.
    const queued = Date.parse(item.queuedAt);
    return page.rows.some(
      (node) => node.title === item.fileName && node.fileSize === item.size && Date.parse(node.updatedAt) >= queued,
    );
  } catch {
    return false;
  }
}
let appStateWired = false;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function uploadsRoot(): Directory {
  const dir = new Directory(Paths.document, "pages-uploads");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function removeLocal(item: UploadItem): void {
  try {
    const dir = new Directory(uploadsRoot(), item.id);
    if (dir.exists) dir.delete();
  } catch {
    // A file we could not delete costs disk, not correctness.
  }
}

function persist(items: UploadItem[]): void {
  const keep = items.filter((item) => item.status !== "done").map((item) => ({ ...item, sent: 0 }));
  void AsyncStorage.setItem(KEY, JSON.stringify(keep)).catch(() => {});
}

function nameFor(file: IncomingFile): string {
  const fromUri = decodeURIComponent(file.uri.split("/").pop() ?? "");
  return safeFileName(file.name || fromUri || "file");
}

/**
 * Takes the picked file into our own directory. A MOVE where it can be (the
 * picker's cache, the share extension's container: both ours, so the move is
 * a rename and costs nothing for 2 GB), a copy where it cannot (an Android
 * `content://` URI from another app, which can be read but never moved).
 *
 * AWAITED, both: in expo-file-system 57 `move` and `copy` return Promises
 * (`internal/NativeFileSystem.types.d.ts`; `copySync`/`moveSync` are the
 * blocking ones, and a blocking 2 GB copy would freeze the screen). The
 * first version called them without `await`, so the catch never saw a
 * failed move and the upload could start on a file still arriving. The test
 * mock was synchronous, which is how that hid.
 */
async function adopt(file: IncomingFile, id: string): Promise<{ uri: string; size: number }> {
  const dir = new Directory(uploadsRoot(), id);
  dir.create({ intermediates: true, idempotent: true });
  const source = new File(file.uri);
  const target = new File(dir, nameFor(file));
  if (!file.uri.startsWith("file://")) {
    // Another app's file (Android `content://`): ours to read, never to move.
    // A move of one copies first and THEN tries to delete the original,
    // which is refused, so it throws with the copy already in place, and a
    // fallback copy then refuses the existing destination. Seen on the
    // emulator 2026-11-06: the whole clip in our folder, the row "no longer
    // on this phone".
    await source.copy(target);
  } else {
    try {
      await source.move(target);
    } catch {
      if (!target.exists) await source.copy(target);
    }
  }
  return { uri: target.uri, size: file.size ?? target.size ?? 0 };
}

function classify(status: number, body: string): UploadError {
  if (status === 401) return "signedOut";
  if (status === 413) return "tooLarge";
  if (status === 422 && body.includes("storage_quota_exceeded")) return "quota";
  if (status === 422 && body.includes("size")) return "tooLarge";
  return "server";
}

export const useUploads = create<UploadsState>((set, get) => {
  const update = (id: string, patch: Partial<UploadItem>, save = true) => {
    set((state) => ({ items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
    if (save) persist(get().items);
  };

  const finish = (item: UploadItem) => {
    update(item.id, { status: "done", sent: item.size, error: null });
    removeLocal(item);
    void queryClient.invalidateQueries({ queryKey: ["pages"] });
  };

  /** A network failure: wait and retry, as for the single request. */
  const retryLater = (item: UploadItem) => {
    if (!get().items.some((i) => i.id === item.id)) return;
    const attempts = item.attempts + 1;
    if (attempts < AUTO_RETRIES) {
      update(item.id, { status: "queued", attempts, error: "network", retryAt: Date.now() + retryDelay(attempts) });
    } else {
      update(item.id, { status: "failed", attempts, error: "network" });
    }
  };

  /**
   * Sends `item` in confirmed pieces. "legacy" when the server has no
   * resumable endpoint (404 on open: an older server), so the caller sends it
   * in one request as before.
   */
  const runResumable = async (item: UploadItem, file: File): Promise<"done" | "legacy" | "stopped"> => {
    update(item.id, { status: "uploading", error: null });
    let uploadId = item.uploadId;
    let offset = item.offset ?? 0;
    const piece = new File(new Directory(uploadsRoot(), item.id), "piece");
    try {
      if (!uploadId) {
        try {
          const opened = await http.post(SESSIONS, {
            space_id: item.destination.spaceId,
            parent_id: item.destination.parentId,
            filename: item.fileName,
            byte_size: item.size,
            content_type: item.mimeType,
          });
          uploadId = String(opened.data.id);
          offset = 0;
          update(item.id, { uploadId, offset });
        } catch (error) {
          const status = httpStatus(error);
          if (status === 404) return "legacy";
          if (status != null) {
            const body = (error as { response?: { data?: unknown } }).response?.data;
            update(item.id, { status: "failed", error: classify(status, JSON.stringify(body ?? "")) });
            return "stopped";
          }
          throw error;
        }
      } else {
        // Resuming: the server says how much it has.
        try {
          const state = await http.get(`${SESSIONS}/${uploadId}`);
          offset = Number(state.data.offset) || 0;
        } catch (error) {
          if (httpStatus(error) === 404) {
            // The session expired (a day) or was swept: start a new one.
            update(item.id, { uploadId: undefined, offset: 0 });
            return runResumable({ ...item, uploadId: undefined, offset: 0 }, file);
          }
          throw error;
        }
      }

      const handle = file.open();
      try {
        while (offset < item.size) {
          const length = Math.min(CHUNK_BYTES, item.size - offset);
          handle.offset = offset;
          piece.write(handle.readBytes(length));
          const from = offset;
          const task = new UploadTask(piece, `${API_URL}${SESSIONS}/${uploadId}`, {
            httpMethod: "PATCH",
            uploadType: UploadType.BINARY_CONTENT,
            headers: { ...(await authHeaders()), "Upload-Offset": String(from), "Content-Type": "application/offset+octet-stream" },
            sessionType: IN_EXPO_GO ? "foreground" : "background",
            onProgress: ({ bytesSent }) => update(item.id, { sent: Math.min(from + bytesSent, item.size) }, false),
          });
          running.set(item.id, task);
          let result: { status: number; body: string };
          try {
            result = await task.uploadAsync();
          } catch (error) {
            // As in `run`: a failed piece's transfer is stopped before any
            // retry, so two sends of one piece are never alive together.
            stopTransfer(task);
            throw error;
          } finally {
            running.delete(item.id);
            task.release();
          }
          if (result.status === 200 || result.status === 409) {
            // 409: not where the server is; its answer says where it is.
            offset = Number(JSON.parse(result.body || "{}").offset ?? offset);
            update(item.id, { offset, sent: offset });
          } else {
            update(item.id, { status: "failed", error: classify(result.status, result.body) });
            return "stopped";
          }
        }
      } finally {
        handle.close();
      }

      await http.post(`${SESSIONS}/${uploadId}/complete`);
      finish(item);
      return "done";
    } catch {
      // Cancelled, or the connection dropped. What the server confirmed is
      // kept (`offset`), so the retry resumes from there.
      retryLater({ ...item, uploadId, offset });
      return "stopped";
    } finally {
      try {
        if (piece.exists) piece.delete();
      } catch {
        // A leftover piece is deleted with the item's folder.
      }
      pump();
    }
  };

  const run = async (queued: UploadItem) => {
    let item = queued;
    const file = new File(item.localUri);
    if (!file.exists) {
      update(item.id, { status: "failed", error: "missingFile" });
      return;
    }
    // A RETRY ASKS THE SERVER FIRST. On a weak link the server can receive the
    // whole file while the phone loses the answer: the phone sees "Connection
    // lost" and, without this, sends it AGAIN. Measured on his iPhone over
    // 2-bar 5G, 2026-11-07: IMG_8520.MOV was on the server at 10:06Z and
    // uploading again in the tray. The check used to run only after a
    // relaunch (`reconcile`).
    if (item.attempts > 0) {
      update(item.id, { status: "checking" }, false);
      if (await arrivedOnServer(item)) {
        finish(item);
        pump();
        return;
      }
    }
    if (!item.legacy) {
      const outcome = await runResumable(item, file);
      if (outcome !== "legacy") return;
      update(item.id, { legacy: true });
      item = { ...item, legacy: true };
    }
    update(item.id, { status: "uploading", sent: 0, error: null });
    const parameters: Record<string, string> = { "node[title]": item.fileName, "node[kind]": "file" };
    if (item.destination.parentId != null) parameters["node[parent_id]"] = String(item.destination.parentId);
    let lastTick = 0;
    const task = new UploadTask(file, `${API_URL}/api/v1/page_app/spaces/${item.destination.spaceId}/nodes`, {
      httpMethod: "POST",
      uploadType: UploadType.MULTIPART,
      fieldName: "node[attachment]",
      mimeType: item.mimeType,
      parameters,
      headers: await authHeaders(),
      // Background on a real build (iOS URLSession, §2 above); Expo Go is
      // Expo's app, not ours, so there it runs while the app is open.
      sessionType: IN_EXPO_GO ? "foreground" : "background",
      onProgress: ({ bytesSent }) => {
        const now = Date.now();
        if (now - lastTick < 250) return;
        lastTick = now;
        update(item.id, { sent: Math.min(bytesSent, item.size) }, false);
      },
    });
    running.set(item.id, task);
    try {
      const result = await task.uploadAsync();
      if (result.status >= 200 && result.status < 300) {
        finish(item);
      } else {
        update(item.id, { status: "failed", error: classify(result.status, result.body) });
      }
    } catch {
      // Cancelled, or the connection dropped. STOP THIS TRANSFER FIRST: an
      // iOS background transfer is not over when its promise fails, the
      // system can keep sending it. His IMG_8511 (543 MB) arrived twice, 23 s
      // apart (2026-11-07): the old attempt and its retry both finished.
      stopTransfer(task);
      if (!get().items.some((i) => i.id === item.id)) return;
      const attempts = item.attempts + 1;
      if (attempts < AUTO_RETRIES) {
        update(item.id, { status: "queued", attempts, error: "network", retryAt: Date.now() + retryDelay(attempts) });
      } else {
        update(item.id, { status: "failed", attempts, error: "network" });
      }
    } finally {
      running.delete(item.id);
      task.release();
      pump();
    }
  };

  const pump = () => {
    const { items } = get();
    const now = Date.now();
    let free = MAX_PARALLEL - items.filter((item) => item.status === "uploading").length;
    for (const item of items) {
      if (free <= 0) break;
      if (item.status === "queued" && !running.has(item.id) && (item.retryAt ?? 0) <= now) {
        free -= 1;
        void run(item);
      }
    }
    // Wake for the soonest backoff still pending.
    const next = get()
      .items.filter((item) => item.status === "queued" && (item.retryAt ?? 0) > now)
      .reduce((soonest, item) => Math.min(soonest, item.retryAt!), Infinity);
    if (wakeTimer) clearTimeout(wakeTimer);
    wakeTimer = Number.isFinite(next) ? setTimeout(pump, next - now) : null;
  };

  /** The network is back: no file waits out its backoff. */
  const resumeNow = () => {
    set((state) => ({
      items: state.items.map((item) => (item.status === "queued" && item.retryAt ? { ...item, retryAt: 0 } : item)),
    }));
    pump();
  };

  /** See this file's header, §3. */
  const reconcile = async (item: UploadItem) => {
    if (await arrivedOnServer(item)) finish(item);
    else update(item.id, { status: "queued" });
    pump();
  };

  return {
    items: [],
    hydrated: false,

    hydrate: async () => {
      if (get().hydrated) return;
      let stored: UploadItem[] = [];
      try {
        const raw = await AsyncStorage.getItem(KEY);
        stored = raw ? (JSON.parse(raw) as UploadItem[]) : [];
      } catch {
        stored = [];
      }
      // Anything mid-flight when the app died is CHECKED, not re-sent.
      // A row the old rule gave up on for a dropped connection is retried,
      // not left red: the network is a reason to wait, never a verdict.
      const items = stored.map((item) =>
        // Killed while its file was still being copied in: the copy is not
        // trustworthy, so it is said plainly ("add it again"), not left spinning.
        item.status === "preparing"
          ? { ...item, status: "failed" as const, error: "missingFile" as const }
          : item.status === "uploading" || item.status === "checking"
          ? { ...item, status: "checking" as const }
          : item.status === "failed" && item.error === "network"
            ? { ...item, status: "queued" as const, attempts: 0, retryAt: 0 }
            : item,
      );
      set({ items, hydrated: true });
      if (!appStateWired) {
        appStateWired = true;
        AppState.addEventListener("change", (state) => {
          if (state === "active") resumeNow();
        });
        useReachability.subscribe((state, previous) => {
          if (state.reachable && !previous.reachable) resumeNow();
        });
      }
      for (const item of items) if (item.status === "checking") void reconcile(item);
      pump();
    },

    enqueue: async (files, destination) => {
      // THE ROWS FIRST, then the copies. Copying a big clip into the app takes
      // seconds; the row says "Preparing…" meanwhile, and each file starts
      // sending as soon as ITS copy is done, while the next is still copying.
      const rows: UploadItem[] = files.map((file) => ({
        id: newId(),
        localUri: file.uri,
        fileName: nameFor(file),
        mimeType: file.mimeType || "application/octet-stream",
        size: file.size ?? 0,
        destination,
        status: "preparing" as const,
        sent: 0,
        error: null,
        attempts: 0,
        queuedAt: new Date().toISOString(),
      }));
      set((state) => ({ items: [...state.items, ...rows] }));
      persist(get().items);
      for (const [index, row] of rows.entries()) {
        if (!get().items.some((i) => i.id === row.id)) continue; // cancelled while waiting
        try {
          const { uri, size } = await adopt(files[index], row.id);
          const tooLarge = size > MAX_FILE_BYTES;
          update(row.id, { localUri: uri, size, status: tooLarge ? "failed" : "queued", error: tooLarge ? "tooLarge" : null });
        } catch {
          update(row.id, { status: "failed", error: "missingFile" });
        }
        pump();
      }
      return rows.length;
    },

    retry: (id) => {
      update(id, { status: "queued", attempts: 0, error: null, sent: 0, retryAt: 0 });
      pump();
    },

    cancel: (id) => {
      const item = get().items.find((i) => i.id === id);
      set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
      persist(get().items);
      running.get(id)?.cancel();
      // The half-sent bytes on the server go too (they count against his
      // space until swept otherwise).
      if (item?.uploadId) void http.delete(`${SESSIONS}/${item.uploadId}`).catch(() => {});
      if (item) removeLocal(item);
    },

    clearFinished: () => {
      set((state) => ({ items: state.items.filter((item) => item.status !== "done") }));
      persist(get().items);
    },
  };
});

// ── The last place something was saved, offered first next time ────────────

const LAST_KEY = "mm-pages-last-destination";
const RECENTS_KEY = "mm-pages-recent-destinations";
export const MAX_RECENTS = 4;

/** The destination plus the picker's own breadcrumb, so it reopens THERE. */
export interface LastDestination extends Destination {
  place?: unknown;
}

export async function loadLastDestination(): Promise<LastDestination | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastDestination;
    return typeof parsed?.spaceId === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLastDestination(destination: LastDestination): Promise<void> {
  return (async () => {
    try {
      await AsyncStorage.setItem(LAST_KEY, JSON.stringify(destination));
      const recents = await loadRecentDestinations();
      const same = (d: Destination) => d.spaceId === destination.spaceId && d.parentId === destination.parentId;
      const next = [destination, ...recents.filter((d) => !same(d))].slice(0, MAX_RECENTS);
      await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      // A place not remembered costs one extra tap next time, nothing more.
    }
  })();
}

// ── The last few places, newest first (Drive's "Suggested" folders) ─────────

export async function loadRecentDestinations(): Promise<LastDestination[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d): d is LastDestination => typeof d?.spaceId === "number" && typeof d?.label === "string");
  } catch {
    return [];
  }
}

/** `YYYY-MM-DD` in the phone's own day — the owner's date-folder names. */
export function todayFolderName(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
