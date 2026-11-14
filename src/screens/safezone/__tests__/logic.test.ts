/**
 * The pure parts of SafeZone (`docs/design/safezone/SECURITY.md` §1, §5, §6):
 * the PIN pad's state, the reveal timer, the clipboard guard.
 */
import { PIN_LENGTH, pinReducer, EMPTY_PIN, lockoutLeft, formatCountdown } from "../pin";
import { createRevealer, REVEAL_MS } from "../reveal";
import { createClipboardGuard, CLIPBOARD_CLEAR_MS } from "../clipboard";

describe("the PIN pad", () => {
  const type = (digits: string) => [...digits].reduce((s, d) => pinReducer(s, { type: "digit", digit: d }), EMPTY_PIN);

  it("takes six digits and no seventh", () => {
    expect(PIN_LENGTH).toBe(6);
    expect(type("1234567").digits).toBe("123456");
    expect(type("123456").complete).toBe(true);
    expect(type("12345").complete).toBe(false);
  });

  it("refuses anything that is not a digit", () => {
    expect(type("12a").digits).toBe("12");
  });

  it("deletes and clears", () => {
    expect(pinReducer(type("123"), { type: "back" }).digits).toBe("12");
    expect(pinReducer(EMPTY_PIN, { type: "back" }).digits).toBe("");
    expect(pinReducer(type("123456"), { type: "clear" })).toEqual(EMPTY_PIN);
  });

  it("counts the lockout down from the SERVER's time, never below zero", () => {
    const now = Date.parse("2026-11-13T21:40:00Z");
    expect(lockoutLeft("2026-11-13T21:47:00Z", now)).toBe(7 * 60);
    expect(lockoutLeft("2026-11-13T21:30:00Z", now)).toBe(0);
    expect(lockoutLeft("not a date", now)).toBe(0);
    expect(formatCountdown(7 * 60)).toBe("7:00");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(0)).toBe("0:00");
  });
});

describe("reveal: one field at a time, hidden again after 20 s", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("hides by itself after REVEAL_MS", () => {
    expect(REVEAL_MS).toBe(20_000);
    const seen: (string | null)[] = [];
    const r = createRevealer({ onChange: (k) => seen.push(k) });
    r.show("password");
    expect(r.visible()).toBe("password");
    jest.advanceTimersByTime(REVEAL_MS - 1);
    expect(r.visible()).toBe("password");
    jest.advanceTimersByTime(1);
    expect(r.visible()).toBeNull();
    expect(seen).toEqual(["password", null]);
  });

  it("revealing another field hides the first, and restarts the clock", () => {
    const r = createRevealer({ onChange: () => {} });
    r.show("card_number");
    jest.advanceTimersByTime(15_000);
    r.show("cvv");
    expect(r.visible()).toBe("cvv");
    jest.advanceTimersByTime(15_000);
    expect(r.visible()).toBe("cvv");
    jest.advanceTimersByTime(5_000);
    expect(r.visible()).toBeNull();
  });

  it("hide and dispose stop the timer", () => {
    const onChange = jest.fn();
    const r = createRevealer({ onChange });
    r.show("password");
    r.hide();
    expect(r.visible()).toBeNull();
    r.show("password");
    r.dispose();
    jest.advanceTimersByTime(REVEAL_MS * 2);
    expect(onChange).toHaveBeenCalledTimes(3); // show, hide, show — nothing after dispose
  });

  it("says how long is left, for the bar", () => {
    const r = createRevealer({ onChange: () => {} });
    r.show("password");
    jest.advanceTimersByTime(5_000);
    expect(r.leftMs()).toBe(15_000);
  });
});

describe("the clipboard guard", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

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
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  it("clears what it copied after 30 s", async () => {
    expect(CLIPBOARD_CLEAR_MS).toBe(30_000);
    const cb = board();
    const g = createClipboardGuard({ clipboard: cb, platform: "android" });
    await g.copy("hunter2");
    expect(cb.read()).toBe("hunter2");
    jest.advanceTimersByTime(CLIPBOARD_CLEAR_MS);
    await flush();
    expect(cb.read()).toBe("");
    expect(g.pendingUntil()).toBeNull();
  });

  it("Android: leaves alone something the person copied since", async () => {
    const cb = board();
    const g = createClipboardGuard({ clipboard: cb, platform: "android" });
    await g.copy("hunter2");
    cb.typeElsewhere("a shopping list");
    jest.advanceTimersByTime(CLIPBOARD_CLEAR_MS);
    await flush();
    expect(cb.read()).toBe("a shopping list");
  });

  it("iOS: clears without reading (reading asks the person to allow paste)", async () => {
    const cb = board();
    const g = createClipboardGuard({ clipboard: cb, platform: "ios" });
    await g.copy("hunter2");
    jest.advanceTimersByTime(CLIPBOARD_CLEAR_MS);
    await flush();
    expect(cb.read()).toBe("");
    expect(cb.getStringAsync).not.toHaveBeenCalled();
  });

  it("keeps no copy of the secret while it waits", async () => {
    const cb = board();
    const g = createClipboardGuard({ clipboard: cb, platform: "android" });
    await g.copy("hunter2-very-secret");
    expect(JSON.stringify(g.debugState())).not.toContain("hunter2");
  });

  it("an overdue clear runs on return (the timer slept in the background)", async () => {
    const cb = board();
    let now = 1_000_000;
    const g = createClipboardGuard({ clipboard: cb, platform: "ios", now: () => now, setTimer: () => () => {} });
    await g.copy("hunter2");
    now += CLIPBOARD_CLEAR_MS - 1;
    await g.clearIfDue();
    expect(cb.read()).toBe("hunter2");
    now += 1;
    await g.clearIfDue();
    expect(cb.read()).toBe("");
  });

  it("clearNow (the vault locking) clears at once, and only once", async () => {
    const cb = board();
    const g = createClipboardGuard({ clipboard: cb, platform: "ios" });
    await g.copy("hunter2");
    await g.clearNow();
    expect(cb.read()).toBe("");
    cb.typeElsewhere("later");
    await g.clearNow();
    jest.advanceTimersByTime(CLIPBOARD_CLEAR_MS);
    await flush();
    expect(cb.read()).toBe("later");
  });

  it("a second copy restarts the 30 s", async () => {
    const cb = board();
    const g = createClipboardGuard({ clipboard: cb, platform: "ios" });
    await g.copy("one");
    jest.advanceTimersByTime(20_000);
    await g.copy("two");
    jest.advanceTimersByTime(20_000);
    await flush();
    expect(cb.read()).toBe("two");
    jest.advanceTimersByTime(10_000);
    await flush();
    expect(cb.read()).toBe("");
  });
});
