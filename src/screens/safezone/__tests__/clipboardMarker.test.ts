/**
 * A copy outlives a killed app (device pass D12, 2026-11-13): copy a password,
 * force-stop MultiMagic 3 s later, and the password still pastes in another
 * app, because the 30 s clear lived only in memory. The fix keeps a MARKER of
 * the pending clear (`clipboardMarker.ts`): an HMAC of the copied text under a
 * random per-install key, and the deadline. Never the secret, and never a bare
 * hash of it, which a short password would give up to an offline guess.
 *
 * The HMAC is checked against Node's own `crypto.createHmac` and RFC 4231's
 * test case 2, not against itself.
 */
import { createHash, createHmac } from "crypto";
import { createClipboardGuard, CLIPBOARD_CLEAR_MS } from "../clipboard";
import { createClipboardMarker, hmacSha256, MARKER_KEY, MARKER_SECRET_KEY } from "../clipboardMarker";

const sha256 = async (bytes: Uint8Array) => new Uint8Array(createHash("sha256").update(bytes).digest());
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const utf8 = (s: string) => new TextEncoder().encode(s);

function memoryStore() {
  const data: Record<string, string> = {};
  return {
    data,
    getItemAsync: jest.fn(async (k: string) => data[k] ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      data[k] = v;
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      delete data[k];
    }),
  };
}

function board(initial = "") {
  let text = initial;
  return {
    setStringAsync: jest.fn(async (v: string) => {
      text = v;
      return true;
    }),
    getStringAsync: jest.fn(async () => text),
    read: () => text,
    typeElsewhere: (v: string) => {
      text = v;
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe("hmacSha256", () => {
  it("RFC 4231 test case 2", async () => {
    const mac = await hmacSha256(utf8("Jefe"), utf8("what do ya want for nothing?"), sha256);
    expect(hex(mac)).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  });

  it("agrees with Node's createHmac, short and long keys (a key over 64 bytes is hashed first)", async () => {
    for (const [key, msg] of [
      ["k", "hunter2"],
      ["x".repeat(64), "QaDevpass-pw1"],
      ["y".repeat(131), "é ü 中文"],
    ]) {
      const mac = await hmacSha256(utf8(key), utf8(msg), sha256);
      expect(hex(mac)).toBe(createHmac("sha256", key).update(msg).digest("hex"));
    }
  });
});

describe("the clipboard marker survives a killed app", () => {
  let now = 1_000_000;
  const clock = () => now;
  let rnd: jest.Mock;
  beforeEach(() => {
    jest.useFakeTimers();
    now = 1_000_000;
    rnd = jest.fn((n: number) => new Uint8Array(n).fill(7));
  });
  afterEach(() => jest.useRealTimers());

  function setup(store = memoryStore(), cb = board(), platform = "android") {
    const marker = createClipboardMarker({ store, digest: sha256, randomBytes: rnd, now: clock });
    const guard = createClipboardGuard({ clipboard: cb, platform, now: clock, marker });
    return { store, cb, marker, guard };
  }

  it("a copy writes {mac, until}: not the secret, not its bare hash", async () => {
    const { store, guard } = setup();
    await guard.copy("hunter2");
    const saved = store.data[MARKER_KEY];
    expect(saved).toBeDefined();
    expect(saved).not.toContain("hunter2");
    const m = JSON.parse(saved);
    expect(Object.keys(m).sort()).toEqual(["mac", "until"]);
    expect(m.until).toBe(now + CLIPBOARD_CLEAR_MS);
    expect(m.mac).not.toBe(createHash("sha256").update("hunter2").digest("hex"));
    expect(m.mac).toBe(createHmac("sha256", Buffer.from(new Uint8Array(32).fill(7))).update("hunter2").digest("hex"));
  });

  it("the key is made once per install and kept in the secure store", async () => {
    const store = memoryStore();
    await setup(store).guard.copy("a");
    await setup(store).guard.copy("b");
    expect(rnd).toHaveBeenCalledTimes(1);
    expect(rnd).toHaveBeenCalledWith(32);
    expect(store.data[MARKER_SECRET_KEY]).toBeDefined();
  });

  it("killed with a copy pending: the next launch, once due, clears it and drops the marker", async () => {
    const store = memoryStore();
    const cb = board();
    await setup(store, cb).guard.copy("hunter2");
    // The app is killed: no timer runs. A new process starts later.
    now += CLIPBOARD_CLEAR_MS + 1;
    const next = setup(store, cb);
    await next.guard.sweep();
    expect(cb.read()).toBe("");
    expect(store.data[MARKER_KEY]).toBeUndefined();
  });

  it("relaunched before the deadline: cleared when it comes, not before", async () => {
    const store = memoryStore();
    const cb = board();
    await setup(store, cb).guard.copy("hunter2");
    now += 10_000;
    const next = setup(store, cb);
    await next.guard.sweep();
    expect(cb.read()).toBe("hunter2");
    now += 20_000;
    jest.advanceTimersByTime(20_000);
    await flush();
    expect(cb.read()).toBe("");
    expect(store.data[MARKER_KEY]).toBeUndefined();
  });

  it("Android: something the person copied since is left alone, and the marker dropped", async () => {
    const store = memoryStore();
    const cb = board();
    await setup(store, cb).guard.copy("hunter2");
    cb.typeElsewhere("a shopping list");
    now += CLIPBOARD_CLEAR_MS + 1;
    await setup(store, cb).guard.sweep();
    expect(cb.read()).toBe("a shopping list");
    expect(store.data[MARKER_KEY]).toBeUndefined();
  });

  it("iOS: cleared without reading (reading asks to allow paste)", async () => {
    const store = memoryStore();
    const cb = board();
    await setup(store, cb, "ios").guard.copy("hunter2");
    now += CLIPBOARD_CLEAR_MS + 1;
    const next = setup(store, cb, "ios");
    await next.guard.sweep();
    expect(cb.read()).toBe("");
    expect(cb.getStringAsync).not.toHaveBeenCalled();
    expect(store.data[MARKER_KEY]).toBeUndefined();
  });

  it("no marker: the clipboard is not even read", async () => {
    const { cb, guard } = setup();
    await guard.sweep();
    expect(cb.getStringAsync).not.toHaveBeenCalled();
    expect(cb.setStringAsync).not.toHaveBeenCalled();
  });

  it("the ordinary 30 s clear, and a lock, drop the marker too", async () => {
    const a = setup();
    await a.guard.copy("hunter2");
    jest.advanceTimersByTime(CLIPBOARD_CLEAR_MS);
    await flush();
    expect(a.store.data[MARKER_KEY]).toBeUndefined();

    const b = setup();
    await b.guard.copy("hunter2");
    await b.guard.clearNow();
    expect(b.store.data[MARKER_KEY]).toBeUndefined();
  });

  it("a store that fails never stops the copy, and still holds no secret", async () => {
    const store = memoryStore();
    store.setItemAsync.mockRejectedValue(new Error("keystore busy"));
    const { cb, guard } = setup(store);
    await guard.copy("hunter2");
    expect(cb.read()).toBe("hunter2");
    expect(JSON.stringify(store.data)).not.toContain("hunter2");
  });
});
