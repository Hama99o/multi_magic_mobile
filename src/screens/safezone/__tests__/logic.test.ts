/**
 * The pure parts of SafeZone (`docs/design/safezone/SECURITY.md` §1, §5, §6):
 * the PIN pad's state, the reveal timer, the clipboard guard.
 */
import { PIN_LENGTH, pinReducer, EMPTY_PIN, lockoutLeft, formatCountdown } from "../pin";
import { createRevealer, REVEAL_MS } from "../reveal";
import { createClipboardGuard, CLIPBOARD_CLEAR_MS } from "../clipboard";
import { cardExpiry, rowSubtitle } from "../display";

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

// The web's card row (`PaymentCardItem.tsx:8-22`): a card is good through the
// END of its expiry month; within 60 days of that it expires soon. Parity
// SafeZone #10, 2026-11-20.
describe("a card's expiry", () => {
  const NOW = new Date(2026, 10, 20); // 20 Nov 2026
  it("is good, soon, or expired, read from MM/YY or MM/YYYY", () => {
    expect(cardExpiry("12/29", NOW)).toBeNull();
    expect(cardExpiry("11/26", NOW)).toBe("soon");
    expect(cardExpiry("12/2026", NOW)).toBe("soon");
    expect(cardExpiry("01/2027", NOW)).toBeNull(); // 31 Jan is 72 days away
    expect(cardExpiry("10/26", NOW)).toBe("expired");
    expect(cardExpiry("02/27", NOW)).toBeNull();
  });
  it("says nothing about what it cannot read", () => {
    expect(cardExpiry(null, NOW)).toBeNull();
    expect(cardExpiry("13/27", NOW)).toBeNull();
    expect(cardExpiry("2027-01", NOW)).toBeNull();
  });
});

describe("a row's second line", () => {
  const t = (k: string) => ({ "safezone.cardTypes.credit_card": "Credit card", "safezone.cardTypes.debit_card": "Debit card" })[k] ?? k;
  it("a card: its last four, credit or debit, and the expiry, as the web's row", () => {
    expect(rowSubtitle({ kind: "payment_cards", id: 1, name: "Visa", cardType: "credit_card", expiry: "12/29", last4: "4242", updatedAt: null }, t)).toBe("•••• 4242 · Credit card · 12/29");
    expect(rowSubtitle({ kind: "payment_cards", id: 1, name: "Visa", cardType: null, expiry: null, last4: null, updatedAt: null }, t)).toBe("••••••••");
  });
});
