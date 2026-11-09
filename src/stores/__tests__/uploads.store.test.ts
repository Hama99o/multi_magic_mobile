/**
 * The upload queue (`stores/uploads.store.ts`): what it sends, and what it
 * does when the upload succeeds, is refused, drops, or is interrupted by
 * the app dying.
 *
 * `expo-file-system` is native, so it is replaced by an in-memory file
 * system and an `UploadTask` whose outcome each test decides. What the
 * multipart request looks like is not invented here: it is the shape the
 * QA probe sent to the local server on 2026-11-06 and got 201 for, with a
 * sha256-identical download afterwards (docs/design/pages/SPEC.md §7).
 */
type Outcome = { status: number; body: string } | Error;

const mockFiles = new Map<string, number>(); // uri -> size
const mockTasks: { url: string; options: Record<string, unknown>; settle: (o: Outcome) => void; cancelled: boolean }[] = [];

jest.mock("expo-file-system", () => {
  const join = (parts: unknown[]) =>
    parts
      .map((p) => (typeof p === "string" ? p : (p as { uri: string }).uri))
      .reduce((a, b) => `${a.replace(/\/$/, "")}/${b.replace(/^\//, "")}`);
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return true;
    }
    create() {}
    delete() {
      for (const uri of [...mockFiles.keys()]) if (uri.startsWith(this.uri + "/")) mockFiles.delete(uri);
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri) ?? 0;
    }
    // ASYNC, as the real module's are (`move`/`copy` return Promises in
    // expo-file-system 57). A synchronous mock is how an un-awaited move
    // passed here once. A `content://` source cannot be moved, only copied.
    // A move of a content:// file behaves as the real one did on the
    // emulator: the copy lands, the delete of the original is refused, and
    // it throws anyway. A copy onto an existing file is refused.
    async move(target: { uri: string }) {
      await Promise.resolve();
      if (!mockFiles.has(this.uri)) throw new Error("cannot move");
      mockFiles.set(target.uri, mockFiles.get(this.uri)!);
      if (this.uri.startsWith("content://")) throw new Error("delete of the original refused");
      mockFiles.delete(this.uri);
    }
    // A handle cuts pieces without loading the file (`runResumable`).
    open() {
      const uri = this.uri;
      return {
        offset: 0 as number | null,
        readBytes(length: number) {
          if (!mockFiles.has(uri)) throw new Error("no such file");
          return new Uint8Array(length);
        },
        close() {},
      };
    }
    write(bytes: Uint8Array) {
      mockFiles.set(this.uri, bytes.length);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    async copy(target: { uri: string }) {
      await Promise.resolve();
      if (!mockFiles.has(this.uri)) throw new Error("no such file");
      if (mockFiles.has(target.uri)) throw new Error("destination exists");
      mockFiles.set(target.uri, mockFiles.get(this.uri)!);
    }
  }
  class UploadTask {
    private settle!: (o: Outcome) => void;
    private promise: Promise<Outcome>;
    record: (typeof mockTasks)[number];
    constructor(_file: unknown, url: string, options: Record<string, unknown>) {
      this.promise = new Promise((resolve) => (this.settle = resolve));
      this.record = { url, options, settle: (o) => this.settle(o), cancelled: false };
      mockTasks.push(this.record);
    }
    async uploadAsync() {
      const outcome = await this.promise;
      if (outcome instanceof Error) throw outcome;
      return { ...outcome, headers: {} };
    }
    cancel() {
      this.record.cancelled = true;
      this.settle(new Error("cancelled"));
    }
    release() {}
  }
  return {
    Directory,
    File,
    UploadTask,
    UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
    Paths: { document: new Directory("file:///doc"), cache: new Directory("file:///cache") },
  };
});

// The resumable endpoint. By default it answers 404, as a server without it
// does, so the tests above exercise the one-request path they were written
// for; the resumable tests below make it answer.
const mockHttp = {
  post: jest.fn(async (..._a: unknown[]): Promise<{ data: Record<string, unknown> }> => {
    throw { response: { status: 404 } };
  }),
  get: jest.fn(async (..._a: unknown[]): Promise<{ data: Record<string, unknown> }> => ({ data: { offset: 0 } })),
  delete: jest.fn(async (..._a: unknown[]) => ({ data: {} })),
};
jest.mock("@/api/http", () => ({
  authHeaders: async () => ({ Authorization: "Bearer test", "X-Device-Fingerprint": "fp" }),
  http: {
    defaults: { baseURL: "http://10.0.2.2:3001" },
    post: (...a: unknown[]) => mockHttp.post(...a),
    get: (...a: unknown[]) => mockHttp.get(...a),
    delete: (...a: unknown[]) => mockHttp.delete(...a),
  },
}));

const mockChildren = jest.fn();
jest.mock("@/api/pages", () => ({
  pagesApi: { children: (...args: unknown[]) => mockChildren(...args) },
  safeFileName: (title: string) => title.replace(/[/\\]/g, "_"),
}));

jest.mock("@/lib/queryClient", () => ({ queryClient: { invalidateQueries: jest.fn() } }));

/* eslint-disable import/first */
import AsyncStorage from "@react-native-async-storage/async-storage";

type Store = typeof import("../uploads.store");
let store: Store;

const DEST = { spaceId: 315, parentId: 3355, label: "QA Pages / QA uploads" };
const flush = () => new Promise((resolve) => setImmediate(resolve));

type Reach = typeof import("../reachability.store");
/** The reachability store the CURRENT queue listens to — the same isolated
 *  module registry, or the test would toggle a different instance. */
let reach: Reach;

function load(): Store {
  let loaded!: Store;
  jest.isolateModules(() => {
    loaded = require("../uploads.store");
    reach = require("../reachability.store");
  });
  return loaded;
}

beforeEach(async () => {
  mockFiles.clear();
  mockTasks.length = 0;
  mockChildren.mockReset();
  await AsyncStorage.clear();
  store = load();
});

function picked(name: string, size: number) {
  const uri = `file:///cache/ImagePicker/${name}`;
  mockFiles.set(uri, size);
  return { uri, name, mimeType: "video/quicktime", size };
}

describe("what it sends", () => {
  it("takes the file into its own folder, then posts it the way the server accepted it", async () => {
    await store.useUploads.getState().enqueue([picked("IMG_0042.MOV", 1_000)], DEST);
    await flush();

    const [item] = store.useUploads.getState().items;
    expect(item.localUri).toMatch(/^file:\/\/\/doc\/pages-uploads\/[^/]+\/IMG_0042\.MOV$/);
    // A MOVE, so a 2 GB clip is not copied: the picker's cache no longer has it.
    expect(mockFiles.has("file:///cache/ImagePicker/IMG_0042.MOV")).toBe(false);

    expect(mockTasks).toHaveLength(1);
    expect(mockTasks[0].url).toMatch(/\/api\/v1\/page_app\/spaces\/315\/nodes$/);
    expect(mockTasks[0].options).toMatchObject({
      httpMethod: "POST",
      uploadType: 1,
      fieldName: "node[attachment]",
      mimeType: "video/quicktime",
      sessionType: "background",
      parameters: { "node[title]": "IMG_0042.MOV", "node[kind]": "file", "node[parent_id]": "3355" },
      headers: { Authorization: "Bearer test", "X-Device-Fingerprint": "fp" },
    });
  });

  // Android: another app's file arrives as a content:// URI that can be read
  // but not moved. It is copied, and the copy is complete before the upload
  // is queued.
  it("copies a content:// file it cannot move, and uploads the copy", async () => {
    const uri = "content://com.android.externalstorage.documents/document/primary%3ADownload%2Fclip.mp4";
    mockFiles.set(uri, 2_000);
    await store.useUploads.getState().enqueue([{ uri, name: "clip.mp4", mimeType: "video/mp4", size: 2_000 }], DEST);
    await flush();
    const [item] = store.useUploads.getState().items;
    expect(item.status).toBe("uploading");
    expect(mockFiles.get(item.localUri)).toBe(2_000);
    expect(mockFiles.has(uri)).toBe(true);
    expect(mockTasks).toHaveLength(1);
  });

  it("leaves parent_id out at a space's root", async () => {
    await store.useUploads.getState().enqueue([picked("a.jpg", 10)], { ...DEST, parentId: null });
    await flush();
    expect(mockTasks[0].options.parameters).toEqual({ "node[title]": "a.jpg", "node[kind]": "file" });
  });

  // ONE at a time (2026-11-07, his iPhone on 2-bar 5G): a whole-file upload
  // restarts from zero when the link drops, and two at once split a weak link,
  // so each took twice as long and was twice as likely to be cut.
  it("runs one at a time, and starts the next when it ends", async () => {
    await store.useUploads.getState().enqueue([picked("1.mov", 10), picked("2.mov", 10), picked("3.mov", 10)], DEST);
    await flush();
    expect(store.MAX_PARALLEL).toBe(1);
    expect(mockTasks).toHaveLength(1);
    mockTasks[0].settle({ status: 201, body: "{}" });
    await flush();
    await flush();
    expect(mockTasks).toHaveLength(2);
  });

  it("refuses a file over 2 GB before sending a byte", async () => {
    await store.useUploads.getState().enqueue([picked("huge.mov", store.MAX_FILE_BYTES + 1)], DEST);
    await flush();
    expect(mockTasks).toHaveLength(0);
    expect(store.useUploads.getState().items[0]).toMatchObject({ status: "failed", error: "tooLarge" });
  });
});

describe("how it ends", () => {
  it("201: done, the local copy deleted, and nothing left to persist", async () => {
    await store.useUploads.getState().enqueue([picked("ok.mov", 10)], DEST);
    await flush();
    const local = store.useUploads.getState().items[0].localUri;
    mockTasks[0].settle({ status: 201, body: '{"node":{}}' });
    await flush();
    await flush();
    expect(store.useUploads.getState().items[0].status).toBe("done");
    expect(mockFiles.has(local)).toBe(false);
    expect(JSON.parse((await AsyncStorage.getItem("mm-pages-uploads"))!)).toEqual([]);
  });

  it("422 storage_quota_exceeded: failed, and says quota", async () => {
    await store.useUploads.getState().enqueue([picked("q.mov", 10)], DEST);
    await flush();
    mockTasks[0].settle({ status: 422, body: '{"error":"storage_quota_exceeded"}' });
    await flush();
    await flush();
    expect(store.useUploads.getState().items[0]).toMatchObject({ status: "failed", error: "quota" });
  });

  // Measured on the device, 2026-11-06: 25 s of airplane mode used to leave
  // every clip "failed" and nothing resumed when the network returned.
  it("a dropped connection waits and retries with a growing delay, and is not a failure", async () => {
    jest.useFakeTimers();
    try {
      await store.useUploads.getState().enqueue([picked("n.mov", 10)], DEST);
      await jest.advanceTimersByTimeAsync(0);
      for (let attempt = 1; attempt <= 5; attempt++) {
        mockTasks.at(-1)!.settle(new Error("network"));
        await jest.advanceTimersByTimeAsync(0);
        const [item] = store.useUploads.getState().items;
        expect(item).toMatchObject({ status: "queued", error: "network", attempts: attempt });
        // Not retried before its delay...
        const before = mockTasks.length;
        await jest.advanceTimersByTimeAsync(store.retryDelay(attempt) - 50);
        expect(mockTasks).toHaveLength(before);
        // ...and retried after it.
        await jest.advanceTimersByTimeAsync(100);
        expect(mockTasks).toHaveLength(before + 1);
      }
      expect(store.retryDelay(30)).toBe(store.RETRY_CEILING_MS);
    } finally {
      jest.useRealTimers();
    }
  });

  // The owner, 2026-11-07, uploading vlog clips over 2-bar 5G (TestFlight
  // build 7): IMG_8520.MOV (101 MB) was already on the server at 10:06Z and
  // his tray showed it uploading again from 1.6 MB. On a weak link the server
  // can receive the whole file while the phone loses the answer; the phone
  // then saw "Connection lost" and sent it AGAIN. The server check used to run
  // only after a relaunch.
  it("a dropped connection after the server got the file: the retry checks first and sends nothing", async () => {
    jest.useFakeTimers();
    try {
      await store.useUploads.getState().enqueue([picked("IMG_8520.MOV", 101_000)], DEST);
      await jest.advanceTimersByTimeAsync(0);
      const queuedAt = Date.parse(store.useUploads.getState().items[0].queuedAt);
      mockChildren.mockResolvedValue({
        rows: [{ title: "IMG_8520.MOV", fileSize: 101_000, updatedAt: new Date(queuedAt + 30_000).toISOString() }],
      });
      mockTasks.at(-1)!.settle(new Error("Connection lost"));
      await jest.advanceTimersByTimeAsync(store.retryDelay(1) + 50);
      expect(mockTasks).toHaveLength(1); // no second transfer
      expect(store.useUploads.getState().items[0].status).toBe("done");
    } finally {
      jest.useRealTimers();
    }
  });

  // His Vloging folder, 2026-11-07: IMG_8511 (543 MB) arrived TWICE, 23 s
  // apart. A failed attempt's iOS BACKGROUND transfer is not over when its
  // promise fails: the system can keep sending it. Retrying without stopping
  // it left two transfers of one file alive, and both finished.
  it("a failed attempt's transfer is cancelled before any retry starts", async () => {
    jest.useFakeTimers();
    try {
      await store.useUploads.getState().enqueue([picked("IMG_8511.MOV", 543_000)], DEST);
      await jest.advanceTimersByTimeAsync(0);
      const first = mockTasks.at(-1)!;
      mockChildren.mockResolvedValue({ rows: [] });
      first.settle(new Error("Connection lost"));
      await jest.advanceTimersByTimeAsync(0);
      expect(first.cancelled).toBe(true);
      await jest.advanceTimersByTimeAsync(store.retryDelay(1) + 50);
      expect(mockTasks).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a dropped connection when the server does NOT have it: sent again", async () => {
    jest.useFakeTimers();
    try {
      await store.useUploads.getState().enqueue([picked("IMG_8511.MOV", 543_000)], DEST);
      await jest.advanceTimersByTimeAsync(0);
      mockChildren.mockResolvedValue({ rows: [] });
      mockTasks.at(-1)!.settle(new Error("Connection lost"));
      await jest.advanceTimersByTimeAsync(store.retryDelay(1) + 50);
      expect(mockTasks).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("retries AT ONCE when the API answers again, without waiting out the delay", async () => {
    const { useReachability } = reach;
    jest.useFakeTimers();
    try {
      await store.useUploads.getState().hydrate();
      await store.useUploads.getState().enqueue([picked("r.mov", 10)], DEST);
      await jest.advanceTimersByTimeAsync(0);
      for (let i = 0; i < 4; i++) {
        mockTasks.at(-1)!.settle(new Error("network"));
        await jest.advanceTimersByTimeAsync(store.retryDelay(i + 1) + 10);
      }
      mockTasks.at(-1)!.settle(new Error("network"));
      await jest.advanceTimersByTimeAsync(0);
      const waiting = mockTasks.length;
      useReachability.setState({ reachable: false });
      useReachability.setState({ reachable: true });
      await jest.advanceTimersByTimeAsync(0);
      expect(mockTasks).toHaveLength(waiting + 1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a row an older version marked failed for the network is retried on launch", async () => {
    await AsyncStorage.setItem(
      "mm-pages-uploads",
      JSON.stringify([{ id: "old", localUri: "file:///doc/pages-uploads/old/o.mov", fileName: "o.mov", mimeType: "video/quicktime", size: 10, destination: DEST, status: "failed", sent: 0, error: "network", attempts: 3, queuedAt: new Date().toISOString() }]),
    );
    mockFiles.set("file:///doc/pages-uploads/old/o.mov", 10);
    store = load();
    await store.useUploads.getState().hydrate();
    await flush();
    expect(mockTasks).toHaveLength(1);
    expect(store.useUploads.getState().items[0].status).toBe("uploading");
  });

  it("cancel stops the transfer and forgets the file", async () => {
    await store.useUploads.getState().enqueue([picked("c.mov", 10)], DEST);
    await flush();
    const { id, localUri } = store.useUploads.getState().items[0];
    store.useUploads.getState().cancel(id);
    await flush();
    expect(mockTasks[0].cancelled).toBe(true);
    expect(store.useUploads.getState().items).toEqual([]);
    expect(mockFiles.has(localUri)).toBe(false);
  });
});

describe("resumable, piece by piece (PageApp::ResumableUpload on the server)", () => {
  // His iPhone over 2-bar 5G, 2026-11-07: a 543 MB clip in ONE request
  // restarted from zero at every drop and never finished. In pieces, a drop
  // costs one piece.
  const MB = 1000 * 1000;
  beforeEach(() => {
    mockHttp.post.mockClear();
    mockHttp.get.mockClear();
    mockHttp.delete.mockClear();
    mockHttp.post.mockImplementation(async (url: unknown) => {
      if (String(url).endsWith("/complete")) return { data: { node: { id: 1 } } };
      return { data: { id: "u-1", offset: 0 } };
    });
    mockHttp.get.mockImplementation(async () => ({ data: { offset: 0 } }));
  });
  afterEach(() => {
    mockHttp.post.mockImplementation(async () => {
      throw { response: { status: 404 } };
    });
  });

  /** Answers the piece in flight as the server would: confirmed up to `to`. */
  function confirm(to: number, status = 200) {
    mockTasks.at(-1)!.settle({ status, body: JSON.stringify({ offset: to }) });
  }

  it("opens a session, sends 8 MB pieces at their offsets, then completes once", async () => {
    await store.useUploads.getState().enqueue([picked("IMG_8511.MOV", 20 * MB)], DEST);
    await flush();
    expect(mockHttp.post).toHaveBeenCalledWith("/api/v1/page_app/uploads", expect.objectContaining({ space_id: 315, parent_id: 3355, filename: "IMG_8511.MOV", byte_size: 20 * MB }));
    const offsets: string[] = [];
    for (const to of [8 * MB, 16 * MB, 20 * MB]) {
      await flush();
      const task = mockTasks.at(-1)!;
      expect(task.url).toMatch(/\/api\/v1\/page_app\/uploads\/u-1$/);
      expect(task.options).toMatchObject({ httpMethod: "PATCH", uploadType: 0 });
      offsets.push((task.options.headers as Record<string, string>)["Upload-Offset"]);
      confirm(to);
      await flush();
    }
    await flush();
    expect(offsets).toEqual(["0", String(8 * MB), String(16 * MB)]);
    expect(mockHttp.post).toHaveBeenCalledWith("/api/v1/page_app/uploads/u-1/complete");
    expect(store.useUploads.getState().items[0].status).toBe("done");
  });

  it("a dropped piece resumes from what the SERVER confirmed, not from zero", async () => {
    jest.useFakeTimers();
    try {
      await store.useUploads.getState().enqueue([picked("IMG_8511.MOV", 20 * MB)], DEST);
      await jest.advanceTimersByTimeAsync(0);
      confirm(8 * MB);
      await jest.advanceTimersByTimeAsync(0);
      mockTasks.at(-1)!.settle(new Error("Connection lost"));
      await jest.advanceTimersByTimeAsync(0);
      expect(store.useUploads.getState().items[0]).toMatchObject({ status: "queued", uploadId: "u-1", offset: 8 * MB });
      mockChildren.mockResolvedValue({ rows: [] }); // not on the server yet
      mockHttp.get.mockImplementation(async () => ({ data: { offset: 8 * MB } }));
      await jest.advanceTimersByTimeAsync(store.retryDelay(1) + 50);
      expect(mockHttp.get).toHaveBeenCalledWith("/api/v1/page_app/uploads/u-1");
      expect((mockTasks.at(-1)!.options.headers as Record<string, string>)["Upload-Offset"]).toBe(String(8 * MB));
      // ONE session: the resume did not open a second.
      expect(mockHttp.post.mock.calls.filter((c) => c[0] === "/api/v1/page_app/uploads")).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a piece the server already had (409) continues from the server's offset", async () => {
    await store.useUploads.getState().enqueue([picked("a.mov", 20 * MB)], DEST);
    await flush();
    confirm(16 * MB, 409);
    await flush();
    await flush();
    expect((mockTasks.at(-1)!.options.headers as Record<string, string>)["Upload-Offset"]).toBe(String(16 * MB));
  });

  it("a server without the resumable endpoint (404) gets the file in one request, as before", async () => {
    mockHttp.post.mockImplementation(async () => {
      throw { response: { status: 404 } };
    });
    await store.useUploads.getState().enqueue([picked("old-server.mov", 10)], DEST);
    await flush();
    expect(mockTasks.at(-1)!.options).toMatchObject({ httpMethod: "POST", uploadType: 1 });
  });

  it("cancel also deletes the half-sent session on the server", async () => {
    await store.useUploads.getState().enqueue([picked("c.mov", 20 * MB)], DEST);
    await flush();
    const [item] = store.useUploads.getState().items;
    store.useUploads.getState().cancel(item.id);
    await flush();
    expect(mockHttp.delete).toHaveBeenCalledWith("/api/v1/page_app/uploads/u-1");
  });
});

describe("after the app was killed mid-upload", () => {
  async function killedWhileUploading(size: number) {
    await store.useUploads.getState().enqueue([picked("clip.mov", size)], DEST);
    await flush();
    const persisted = JSON.parse((await AsyncStorage.getItem("mm-pages-uploads"))!);
    expect(persisted[0].status).toBe("uploading");
    // A new launch: a new module, the same storage.
    mockTasks.length = 0;
    store = load();
    return persisted[0] as { queuedAt: string };
  }

  it("does NOT send it again when the server already has it (iOS finished it in the background)", async () => {
    const item = await killedWhileUploading(4_000);
    mockChildren.mockResolvedValue({
      rows: [{ title: "clip.mov", fileSize: 4_000, updatedAt: new Date(Date.parse(item.queuedAt) + 60_000).toISOString() }],
    });
    await store.useUploads.getState().hydrate();
    await flush();
    await flush();
    expect(mockChildren).toHaveBeenCalledWith(315, 3355, 1, { sortBy: "created_at", sortDir: "desc" });
    expect(mockTasks).toHaveLength(0);
    expect(store.useUploads.getState().items[0].status).toBe("done");
  });

  it("sends it again when the server does not have it", async () => {
    await killedWhileUploading(4_000);
    mockChildren.mockResolvedValue({ rows: [{ title: "clip.mov", fileSize: 999, updatedAt: "2099-01-01T00:00:00Z" }] });
    await store.useUploads.getState().hydrate();
    await flush();
    await flush();
    expect(mockTasks).toHaveLength(1);
  });
});

describe("a row at once (QA_FULL U4)", () => {
  // Measured 2026-11-07: after picking a 107 MB clip, ~5 s passed with no
  // sign anything had happened while the file was copied into the app.
  it("the row appears as 'preparing' BEFORE the copy finishes, then queues", async () => {
    const pending = store.useUploads.getState().enqueue([picked("big.mov", 107_000_000)], DEST);
    const [row] = store.useUploads.getState().items;
    expect(row).toMatchObject({ status: "preparing", fileName: "big.mov", size: 107_000_000 });
    await pending;
    await flush();
    expect(store.useUploads.getState().items[0].status).toBe("uploading");
  });

  it("a row left 'preparing' by a killed app comes back as failed, not stuck", async () => {
    await AsyncStorage.setItem(
      "mm-pages-uploads",
      JSON.stringify([{ id: "p", localUri: "content://x", fileName: "p.mov", mimeType: "video/quicktime", size: 10, destination: DEST, status: "preparing", sent: 0, error: null, attempts: 0, queuedAt: new Date().toISOString() }]),
    );
    store = load();
    await store.useUploads.getState().hydrate();
    expect(store.useUploads.getState().items[0]).toMatchObject({ status: "failed", error: "missingFile" });
  });
});

describe("todayFolderName", () => {
  it("is the phone's own day, YYYY-MM-DD", () => {
    expect(store.todayFolderName(new Date(2026, 10, 6, 23, 30))).toBe("2026-11-06");
    expect(store.todayFolderName(new Date(2026, 0, 2, 0, 5))).toBe("2026-01-02");
  });
});

describe("the recent places, offered first in Save to Pages", () => {
  const at = (parentId: number | null, label: string) => ({ spaceId: 315, parentId, label });

  it("keeps the last few, newest first, one row per place, and the last one too", async () => {
    await store.saveLastDestination(at(1, "QA Pages / a"));
    await store.saveLastDestination(at(2, "QA Pages / b"));
    await store.saveLastDestination(at(1, "QA Pages / a")); // again: moves up, not duplicated
    expect((await store.loadRecentDestinations()).map((d) => d.label)).toEqual(["QA Pages / a", "QA Pages / b"]);
    expect((await store.loadLastDestination())?.label).toBe("QA Pages / a");
  });

  it("holds at most MAX_RECENTS", async () => {
    for (let i = 0; i < store.MAX_RECENTS + 3; i += 1) await store.saveLastDestination(at(i, `p${i}`));
    const recents = await store.loadRecentDestinations();
    expect(recents).toHaveLength(store.MAX_RECENTS);
    expect(recents[0].label).toBe(`p${store.MAX_RECENTS + 2}`);
  });

  it("reads garbage as nothing rather than crashing the picker", async () => {
    await AsyncStorage.setItem("mm-pages-recent-destinations", "{not json");
    expect(await store.loadRecentDestinations()).toEqual([]);
    await AsyncStorage.setItem("mm-pages-recent-destinations", JSON.stringify([{ spaceId: "x" }, at(null, "QA Pages")]));
    expect((await store.loadRecentDestinations()).map((d) => d.label)).toEqual(["QA Pages"]);
  });
});
